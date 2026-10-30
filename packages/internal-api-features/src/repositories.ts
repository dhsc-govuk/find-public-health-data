import type { Readable } from 'node:stream';
import type { IndicatorListScope } from '@fphd/auth/permissions';

import { type Database, listTopics, type Topic } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';

import { type CiMethodRow, getCiMethodById, listCiMethods } from './ci-method-repository.ts';
import type { ReviewerOption, TagOptions, ValueTypeAndUnitOptions } from './contract.ts';
import { type DataProviderRow, listDataProviders } from './data-provider-repository.ts';
import type { DataTableRow } from './data-table-check-contract.ts';
import {
  type ConfirmDataTableResult,
  confirmDataTable,
  type DraftDataTableRow,
  type FindDraftDataTableResult,
  findDraftDataTable,
  listDataTableRows,
} from './data-table-check-repository.ts';
import {
  type DataUpload,
  type ProcessDataUploadResult,
  processDataUpload,
} from './data-upload-load-repository.ts';
import {
  findUploadDraftVersion,
  getLatestDataUpload,
  type LatestDataUploadRow,
  type UploadDraftRow,
} from './data-upload-repository.ts';
import type { EditPrecondition } from './edit-version.ts';
import {
  type CreateIndicatorDraftResult,
  createIndicatorDraft,
  getIndicatorDraftState,
  type IndicatorDraft,
  type IndicatorDraftAttributes,
  type IndicatorDraftStateRow,
  type NewIndicatorDraftAttributes,
  type UpdateIndicatorDraftResult,
  updateIndicatorDraft,
} from './indicator-draft-repository.ts';
import {
  findIndicatorTeamId,
  getIndicatorById,
  type IndicatorAdminDetailRow,
  type IndicatorAdminListRow,
  type IndicatorAdminRows,
  type IndicatorsUnderReviewRows,
  listIndicatorsPage,
  listIndicatorsToReview,
  listIndicatorsUnderReview,
} from './indicator-list-repository.ts';
import {
  type CreateDraftFromPublishedResult,
  createDraftFromPublished,
} from './indicator-publish-repository.ts';
import type { IndicatorDraftLists } from './indicator-version-lists-repository.ts';
import {
  assignReviewers,
  type IndicatorStepResult,
  type ReviewerAssignment,
  submitIndicator,
  withdrawSubmission,
} from './indicator-workflow-repository.ts';
import { listReviewerOptions } from './reviewer-repository.ts';
import { listTagOptions } from './tag-repository.ts';
import {
  type CreateTopicResult,
  countLinkedIndicators,
  createTopic,
  type DeleteTopicResult,
  deleteTopic,
  getTopicById,
  type TopicRow,
  type TopicUpdate,
  type UpdateTopicResult,
  updateTopic,
} from './topic-repository.ts';
import { listValueTypeAndUnitOptions } from './value-type-and-unit-repository.ts';

/** The publisher's topic surface: the public listing plus the writes only `internal_api` makes. */
export interface InternalTopicRepository {
  list(): Promise<Topic[]>;
  findById(id: string): Promise<TopicRow | undefined>;
  countLinkedIndicators(id: string): Promise<number>;
  create(values: TopicUpdate, actor: Actor): Promise<CreateTopicResult>;
  /** Saves the topic, unless it has changed since the form was shown. */
  update(
    id: string,
    values: TopicUpdate,
    actor: Actor,
    precondition: EditPrecondition<TopicRow>,
  ): Promise<UpdateTopicResult>;
  delete(id: string, actor: Actor): Promise<DeleteTopicResult>;
}

/** The publisher's view of indicators: every status, unlike the public repository. */
export interface InternalIndicatorRepository {
  listPage(page: number, pageSize: number, scope: IndicatorListScope): Promise<IndicatorAdminRows>;
  /** The open submissions in scope, waiting for reviewers or in review, oldest first. */
  listUnderReview(scope: IndicatorListScope): Promise<IndicatorsUnderReviewRows>;
  /** The submissions in review that the reviewer is assigned, oldest first. */
  listToReview(reviewerId: string): Promise<IndicatorAdminListRow[]>;
  findById(id: string): Promise<IndicatorAdminDetailRow | undefined>;
  /** The indicator's team, null when it has none, or undefined when there is no such indicator. */
  findTeamId(id: string): Promise<string | null | undefined>;
  /** The draft and whether anything is published, read together for the task list. */
  findDraftState(id: string): Promise<IndicatorDraftStateRow | undefined>;
  createDraft(
    attributes: NewIndicatorDraftAttributes,
    actor: Actor,
    teamId: string,
  ): Promise<CreateIndicatorDraftResult>;
  /** Saves a form's answers, unless the draft has changed since the form was shown. */
  updateDraft(
    indicatorId: string,
    attributes: IndicatorDraftAttributes,
    lists: IndicatorDraftLists,
    actor: Actor,
    precondition: EditPrecondition<IndicatorDraft>,
  ): Promise<UpdateIndicatorDraftResult>;
  /** Opens a draft from the published version, copying its columns and lists. */
  draftFromPublished(indicatorId: string, actor: Actor): Promise<CreateDraftFromPublishedResult>;
  /** Submits the draft for approval, as long as it is complete and `draftUpdatedAt` is current. */
  submit(
    indicatorId: string,
    draftUpdatedAt: Date,
    actor: Actor,
  ): Promise<IndicatorStepResult<'changed' | 'incomplete'>>;
  /** Withdraws the draft's submission, unlocking the draft, as long as it is the one numbered. */
  withdraw(
    indicatorId: string,
    submissionNumber: number,
    actor: Actor,
  ): Promise<IndicatorStepResult<'changed'>>;
  /** Assigns or changes the reviewers, as long as the submission and reviewers shown are current. */
  assignReviewers(
    indicatorId: string,
    assignment: ReviewerAssignment,
    actor: Actor,
  ): Promise<IndicatorStepResult<'changed' | 'not_a_reviewer'>>;
}

/** The confidence interval methods a publisher chooses from. */
export interface InternalCiMethodRepository {
  list(): Promise<CiMethodRow[]>;
  findById(id: string): Promise<CiMethodRow | undefined>;
}

/** The reviewers an IMRG manager chooses from. */
export interface InternalReviewerRepository {
  /** The reviewers who may review the indicator, with how many indicators each is reviewing. */
  listOptions(indicatorId: string): Promise<ReviewerOption[]>;
}

/** The topics and classifications a publisher tags an indicator with. */
export interface InternalTagRepository {
  listOptions(): Promise<TagOptions>;
}

/** The providers of data, and their sources, a publisher chooses from. */
export interface InternalDataProviderRepository {
  list(): Promise<DataProviderRow[]>;
}

/**
 * Data table uploads for a draft: loading a stored file, the result of the latest upload, and
 * checking the uploaded table.
 */
export interface InternalDataUploadRepository {
  /** The indicator's draft version, null without a draft, undefined with no indicator. */
  findDraft(indicatorId: string): Promise<UploadDraftRow | null | undefined>;
  findLatest(draftId: string): Promise<LatestDataUploadRow | undefined>;
  process(
    upload: DataUpload,
    openFile: () => Promise<Readable>,
    signal: AbortSignal,
  ): Promise<ProcessDataUploadResult>;
  findDraftDataTable(indicatorId: string): Promise<FindDraftDataTableResult>;
  listRows(
    batch: Pick<DraftDataTableRow, 'batchId' | 'rowCount'>,
    page: number,
    rowsPerPage: number,
  ): Promise<DataTableRow[]>;
  /** Confirms the draft's data table, as long as the draft still uses the batch named. */
  confirm(indicatorId: string, batchId: string, actor: Actor): Promise<ConfirmDataTableResult>;
}

/** The value types and units a publisher chooses from. */
export interface InternalValueTypeAndUnitRepository {
  listOptions(): Promise<ValueTypeAndUnitOptions>;
}

/**
 * Everything the internal-only routes read and write, mirroring `Repositories` in `@fphd/db`.
 * Queries live here so the artefact-boundary check keeps them out of the public image.
 */
export interface InternalRepositories {
  ciMethods: InternalCiMethodRepository;
  dataProviders: InternalDataProviderRepository;
  dataUploads: InternalDataUploadRepository;
  indicators: InternalIndicatorRepository;
  reviewers: InternalReviewerRepository;
  tags: InternalTagRepository;
  topics: InternalTopicRepository;
  valueTypesAndUnits: InternalValueTypeAndUnitRepository;
}

export function createInternalRepositories(db: Database): InternalRepositories {
  return {
    ciMethods: {
      list: () => listCiMethods(db),
      findById: (id) => getCiMethodById(db, id),
    },
    dataProviders: {
      list: () => listDataProviders(db),
    },
    dataUploads: {
      findDraft: (indicatorId) => findUploadDraftVersion(db, indicatorId),
      findLatest: (draftId) => getLatestDataUpload(db, draftId),
      process: (upload, openFile, signal) => processDataUpload(db, upload, openFile, signal),
      findDraftDataTable: (indicatorId) => findDraftDataTable(db, indicatorId),
      listRows: (batch, page, rowsPerPage) => listDataTableRows(db, batch, page, rowsPerPage),
      confirm: (indicatorId, batchId, actor) => confirmDataTable(db, indicatorId, batchId, actor),
    },
    indicators: {
      listPage: (page, pageSize, scope) => listIndicatorsPage(db, page, pageSize, scope),
      listUnderReview: (scope) => listIndicatorsUnderReview(db, scope),
      listToReview: (reviewerId) => listIndicatorsToReview(db, reviewerId),
      findById: (id) => getIndicatorById(db, id),
      findTeamId: (id) => findIndicatorTeamId(db, id),
      findDraftState: (id) => getIndicatorDraftState(db, id),
      createDraft: (attributes, actor, teamId) =>
        createIndicatorDraft(db, attributes, actor, teamId),
      updateDraft: (indicatorId, attributes, lists, actor, precondition) =>
        updateIndicatorDraft(db, indicatorId, attributes, lists, actor, precondition),
      draftFromPublished: (indicatorId, actor) => createDraftFromPublished(db, indicatorId, actor),
      submit: (indicatorId, draftUpdatedAt, actor) =>
        submitIndicator(db, indicatorId, draftUpdatedAt, actor),
      withdraw: (indicatorId, submissionNumber, actor) =>
        withdrawSubmission(db, indicatorId, submissionNumber, actor),
      assignReviewers: (indicatorId, assignment, actor) =>
        assignReviewers(db, indicatorId, assignment, actor),
    },
    reviewers: {
      listOptions: (indicatorId) => listReviewerOptions(db, indicatorId),
    },
    tags: {
      listOptions: () => listTagOptions(db),
    },
    topics: {
      list: () => listTopics(db),
      findById: (id) => getTopicById(db, id),
      countLinkedIndicators: (id) => countLinkedIndicators(db, id),
      create: (values, actor) => createTopic(db, values, actor),
      update: (id, values, actor, precondition) => updateTopic(db, id, values, actor, precondition),
      delete: (id, actor) => deleteTopic(db, id, actor),
    },
    valueTypesAndUnits: {
      listOptions: () => listValueTypeAndUnitOptions(db),
    },
  };
}
