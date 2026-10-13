export interface NormalizedComment {
  igUserId: string; // entry.id: conta Instagram do afiliado
  commentId: string;
  mediaId: string;
  fromId: string; // IGSID de quem comentou
  fromUsername: string;
  text: string;
  parentId: string | null;
  timestamp: number | null;
}

export type AccountStatus = 'connected' | 'needs_reconnect' | 'disconnected';

export interface AccountRow {
  id: string;
  user_id: string;
  ig_user_id: string;
  status: AccountStatus;
}

export type TargetScope = 'specific_media' | 'any_media';
export type MatchMode = 'contains' | 'exact' | 'any';

export interface AutomationRow {
  id: string;
  user_id: string;
  ig_account_id: string;
  target_scope: TargetScope;
  media_id: string | null;
  match_mode: MatchMode;
  keywords: string[];
  exclude_keywords: string[];
  public_replies: string[];
  dm_text: string;
  link_url: string | null;
  once_per_contact: boolean;
  created_at: string;
}

export interface AccessInfo {
  hasAccess: boolean;
  allowInstagram: boolean;
  maxDmsMonth: number;
}

export type MessageKind = 'dm' | 'public_reply';

export interface MessageRef {
  userId: string;
  accountId: string;
  automationId: string;
  contactId: string;
  commentId: string;
  kind: MessageKind;
}

export interface Store {
  findAccountByIgUserId(igUserId: string): Promise<AccountRow | null>;
  listActiveAutomations(accountId: string): Promise<AutomationRow[]>;
  getAccess(userId: string): Promise<AccessInfo>;
  upsertContact(a: { userId: string; accountId: string; igsid: string; username: string }): Promise<string>;
  wasAlreadySentToContact(automationId: string, contactId: string): Promise<boolean>;
  /** false = ja existe linha para (automacao, comentario, tipo): nao reenviar. */
  claimMessage(ref: MessageRef): Promise<boolean>;
  finishMessage(ref: MessageRef, status: 'sent' | 'failed' | 'blocked', errorCode: string | null): Promise<void>;
  /** Falha transitoria: remove a linha 'sending' para permitir nova tentativa. */
  releaseMessage(ref: MessageRef): Promise<void>;
  consumeDmQuota(userId: string, limit: number): Promise<boolean>;
  refundDmQuota(userId: string): Promise<void>;
  getToken(accountId: string): Promise<string | null>;
  markAccountNeedsReconnect(accountId: string, reason: string): Promise<void>;
}

export type ProcessOutcome = 'done' | 'ignored' | 'blocked' | 'retry' | 'failed';

export interface ProcessResult {
  outcome: ProcessOutcome;
  reason: string;
}
