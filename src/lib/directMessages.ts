import {
  addDoc,
  collection,
  doc,
  getDoc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { getIdTokenResult } from 'firebase/auth';
import { auth, db } from './firebase';

export interface DirectMessageConversation {
  respondentId: string;
  assignedStaffUids: string[];
  createdAt: Date | null;
}

export interface DirectMessage {
  id: string;
  senderUid: string;
  body: string;
  type: 'text';
  createdAt: Date | null;
}

const MAX_MESSAGE_LENGTH = 4000;
const MESSAGE_PAGE_SIZE = 50;

function normalizeRespondentId(value: string): string {
  const id = String(value || '').trim();
  if (!id || id.length > 150 || id.includes('/')) {
    throw new Error('ID PPKS tidak valid untuk Direct Message.');
  }
  return id;
}

function toDate(value: unknown): Date | null {
  if (value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate();
  }
  return value instanceof Date ? value : null;
}

function mapMessage(id: string, data: DocumentData): DirectMessage {
  return {
    id,
    senderUid: String(data.senderUid || ''),
    body: String(data.body || ''),
    type: 'text',
    createdAt: toDate(data.createdAt),
  };
}

export function subscribeToDirectMessageConversation(
  respondentId: string,
  onConversation: (conversation: DirectMessageConversation | null) => void,
  onError: (error: Error) => void,
): () => void {
  const id = normalizeRespondentId(respondentId);
  if (!auth.currentUser) throw new Error('Masuk ke SIPANDU sebelum membuka Direct Message.');

  return onSnapshot(
    doc(db, 'conversations', id),
    (snapshot) => {
      if (!snapshot.exists()) {
        onConversation(null);
        return;
      }
      const data = snapshot.data();
      onConversation({
        respondentId: id,
        assignedStaffUids: Array.isArray(data.assignedStaffUids)
          ? data.assignedStaffUids.filter((value: unknown): value is string => typeof value === 'string')
          : [],
        createdAt: toDate(data.createdAt),
      });
    },
    (error) => onError(error),
  );
}

export function subscribeToDirectMessages(
  respondentId: string,
  onMessages: (messages: DirectMessage[]) => void,
  onError: (error: Error) => void,
): () => void {
  const id = normalizeRespondentId(respondentId);
  if (!auth.currentUser) throw new Error('Masuk ke SIPANDU sebelum membuka Direct Message.');

  const messagesQuery = query(
    collection(db, 'conversations', id, 'messages'),
    orderBy('createdAt', 'asc'),
    limitToLast(MESSAGE_PAGE_SIZE),
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => onMessages(snapshot.docs.map((item) => mapMessage(item.id, item.data()))),
    (error) => onError(error),
  );
}

/**
 * Staff creates the conversation container on the first manual send.
 * Assignment is copied only from the existing, staff-managed service status.
 * Respondent accounts cannot create a conversation or choose their own PPKS ID.
 */
async function ensureStaffConversation(
  respondentId: string,
  assignedStaffUid: string,
  canManageAssignments: boolean,
): Promise<void> {
  const id = normalizeRespondentId(respondentId);
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi SIPANDU berakhir. Masuk kembali sebelum mengirim pesan.');

  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (!['owner', 'supervisor', 'pendamping'].includes(String(role))) {
    throw new Error('Hanya akun petugas SIPANDU yang dapat memulai percakapan.');
  }
  if (role === 'pendamping' && assignedStaffUid !== user.uid) {
    throw new Error('Pendamping hanya dapat memulai percakapan dengan PPKS yang ditugaskan kepadanya.');
  }

  const assignedStaffUids = assignedStaffUid ? [assignedStaffUid] : [];
  const conversationRef = doc(db, 'conversations', id);
  const existing = await getDoc(conversationRef);

  if (!existing.exists()) {
    await setDoc(conversationRef, {
      respondentId: id,
      assignedStaffUids,
      createdAt: serverTimestamp(),
    });
    return;
  }

  if (canManageAssignments) {
    const current = Array.isArray(existing.data().assignedStaffUids)
      ? existing.data().assignedStaffUids
      : [];
    const unchanged = current.length === assignedStaffUids.length
      && current.every((value: unknown, index: number) => value === assignedStaffUids[index]);
    if (!unchanged) {
      await updateDoc(conversationRef, { assignedStaffUids });
    }
  }
}

export async function sendDirectMessage(
  respondentId: string,
  rawBody: string,
  options: {
    assignedStaffUid?: string;
    canManageAssignments?: boolean;
  } = {},
): Promise<void> {
  const id = normalizeRespondentId(respondentId);
  const body = String(rawBody || '').trim();
  if (!body) throw new Error('Tulis pesan terlebih dahulu.');
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Pesan terlalu panjang. Batasnya ${MAX_MESSAGE_LENGTH.toLocaleString('id-ID')} karakter.`);
  }

  const user = auth.currentUser;
  if (!user) throw new Error('Sesi SIPANDU berakhir. Masuk kembali sebelum mengirim pesan.');

  const token = await getIdTokenResult(user);
  const role = token.claims.role;
  if (role === 'responden') {
    const respondentClaim = String(token.claims.ppksId || '');
    if (respondentClaim !== id) {
      throw new Error('Akun responden hanya dapat mengirim pesan pada percakapannya sendiri.');
    }
    const conversation = await getDoc(doc(db, 'conversations', id));
    if (!conversation.exists()) {
      throw new Error('Percakapan belum dibuka oleh petugas SIPANDU. Hubungi pendamping untuk memulai percakapan.');
    }
  } else {
    await ensureStaffConversation(
      id,
      String(options.assignedStaffUid || ''),
      Boolean(options.canManageAssignments),
    );
  }

  await addDoc(collection(db, 'conversations', id, 'messages'), {
    senderUid: user.uid,
    body,
    type: 'text',
    createdAt: serverTimestamp(),
  });
}
