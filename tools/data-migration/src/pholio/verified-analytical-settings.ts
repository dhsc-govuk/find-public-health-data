export default [
  {
    indicator_id: 91871,
    owner_profile_id: 105,
    polarity_id: 99,
    comparator_method_id: 1,
    verified_at: '2026-11-03',
    reason:
      'The owning profile publishes not-applicable polarity consistently. The September backup retains directional settings for some area types.',
    evidence_urls: [
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1938133238&area_type_id=6',
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1938133238&area_type_id=15',
    ],
    expected_groupings: [
      {
        GroupID: 1938133238,
        ProfileId: 105,
        PolarityID: 0,
        ComparatorMethodID: 1,
      },
      {
        GroupID: 1938133238,
        ProfileId: 105,
        PolarityID: 99,
        ComparatorMethodID: 1,
      },
      {
        GroupID: 1938133457,
        ProfileId: 159,
        PolarityID: 0,
        ComparatorMethodID: 1,
      },
      {
        GroupID: 1938133458,
        ProfileId: 159,
        PolarityID: 0,
        ComparatorMethodID: 1,
      },
    ],
  },
  {
    indicator_id: 93553,
    owner_profile_id: 23,
    polarity_id: 0,
    comparator_method_id: 15,
    verified_at: '2026-11-17',
    reason:
      'The source owner has no grouping. The 29 October 2026 backup no longer groups it in the Local Authority Health Profiles, and its five remaining groupings and published profiles all use polarity 0 and comparator method 15.',
    evidence_urls: [
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1938132983&area_type_id=502',
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1938133081&area_type_id=15',
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1938133152&area_type_id=6',
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1938133285&area_type_id=502',
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1938133449&area_type_id=502',
    ],
    expected_groupings: [
      {
        GroupID: 1938132983,
        ProfileId: 19,
        PolarityID: 0,
        ComparatorMethodID: 15,
      },
      {
        GroupID: 1938133081,
        ProfileId: 132,
        PolarityID: 0,
        ComparatorMethodID: 15,
      },
      {
        GroupID: 1938133152,
        ProfileId: 76,
        PolarityID: 0,
        ComparatorMethodID: 15,
      },
      {
        GroupID: 1938133285,
        ProfileId: 155,
        PolarityID: 0,
        ComparatorMethodID: 15,
      },
      {
        GroupID: 1938133449,
        ProfileId: 32,
        PolarityID: 0,
        ComparatorMethodID: 15,
      },
    ],
  },
  {
    indicator_id: 93582,
    owner_profile_id: 50,
    polarity_id: 0,
    comparator_method_id: 12,
    verified_at: '2026-11-17',
    reason:
      'The owning profile publishes it with polarity 0 in one domain and polarity 99 in its Quality and outcomes domain. Polarity 0 is the setting in three of its four published groups, including the Public Health Outcomes Framework and the Mortality Profile; every group uses comparator method 12.',
    evidence_urls: [
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1938133452&area_type_id=6',
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1938133456&area_type_id=6',
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1938133058&area_type_id=6',
      'https://fingertips.phe.org.uk/api/profile_group_roots?group_id=1000044&area_type_id=6',
    ],
    expected_groupings: [
      {
        GroupID: 1000044,
        ProfileId: 19,
        PolarityID: 0,
        ComparatorMethodID: 12,
      },
      {
        GroupID: 1938133058,
        ProfileId: 125,
        PolarityID: 0,
        ComparatorMethodID: 12,
      },
      {
        GroupID: 1938133452,
        ProfileId: 50,
        PolarityID: 0,
        ComparatorMethodID: 12,
      },
      {
        GroupID: 1938133456,
        ProfileId: 50,
        PolarityID: 99,
        ComparatorMethodID: 12,
      },
    ],
  },
] as const;
