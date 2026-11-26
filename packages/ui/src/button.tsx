import NotGovUKButton, { type ButtonProps } from '@not-govuk/button';

/**
 * NotGovUK's Button, with double-click protection on by default for a submit button: a second
 * press within a second of the one before is ignored, so a form is not sent twice. A button of
 * another type, or a link styled as a button, is left as it is, as a second press there can mean
 * something. A submit button opts out with `preventDoubleClick={false}`.
 */
export function Button(props: ButtonProps) {
  if ('href' in props) return <NotGovUKButton {...props} />;

  const isSubmit = (props.type ?? 'submit') === 'submit';
  return <NotGovUKButton preventDoubleClick={isSubmit} {...props} />;
}
