/**
 * Why an account request did not succeed — the screens choose their text by `kind`, never by the message.
 *
 * - `unavailable` — this build has no cloud backend (or none for the region of the stored session);
 * - `network` — no answer from the server: the same call may work later;
 * - `rate_limited` — too many letters or attempts, try in a minute;
 * - `invalid_email` — the server did not accept the address;
 * - `sign_up_closed` — the region does not register new accounts now;
 * - `invalid_code` — the code or the link is wrong, used or expired;
 * - `no_pending_sign_in` — a code or a link came, but this device did not ask for a letter;
 * - `signed_out` — the call needs a session and there is none;
 * - `session_expired` — the server no longer knows the session: it is erased on the device, sign in again;
 * - `age_required` — the server takes no consent and no data until the age is confirmed;
 * - `server` — anything else the server refused.
 */
export type AccountErrorKind =
  | 'unavailable'
  | 'network'
  | 'rate_limited'
  | 'invalid_email'
  | 'sign_up_closed'
  | 'invalid_code'
  | 'no_pending_sign_in'
  | 'signed_out'
  | 'session_expired'
  | 'age_required'
  | 'server';

const MESSAGES: Record<AccountErrorKind, string> = {
  unavailable: 'В этой сборке нет облачного аккаунта',
  network: 'Нет связи с сервером. Проверьте интернет и повторите',
  rate_limited: 'Слишком много попыток. Подождите минуту и повторите',
  invalid_email: 'Сервер не принял этот адрес почты',
  sign_up_closed: 'Регистрация новых аккаунтов сейчас закрыта',
  invalid_code: 'Код или ссылка не подошли: они неверны, уже использованы или устарели',
  no_pending_sign_in: 'На этом устройстве вход не запрашивали. Запросите письмо заново',
  signed_out: 'Сначала войдите в аккаунт',
  session_expired: 'Сессия закончилась. Войдите заново',
  age_required: 'Сначала подтвердите возраст',
  server: 'Сервер отклонил запрос',
};

/**
 * The message is one of the fixed texts above: nothing the server or the device sent (a token, an address, a
 * response body) is ever copied into an error, so an error can be shown or logged as it is.
 */
export class AccountError extends Error {
  readonly kind: AccountErrorKind;
  /** HTTP status of the answer; `undefined` when there was none. */
  readonly status: number | undefined;

  constructor(kind: AccountErrorKind, status?: number) {
    super(MESSAGES[kind]);
    this.name = 'AccountError';
    this.kind = kind;
    this.status = status;
  }
}
