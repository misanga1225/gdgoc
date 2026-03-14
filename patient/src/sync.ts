import { doc, setDoc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { ParagraphGaze } from "./gaze";

/**
 * 視線データをFirestoreに同期する
 * Patients/{sessionId}/LiveGaze/{paragraphId} に書き込み
 */
export async function syncGazeData(
  sessionId: string,
  gazeData: ParagraphGaze[]
): Promise<void> {
  const writes = gazeData.map((gaze) => {
    const ref = doc(db, "Patients", sessionId, "LiveGaze", gaze.paragraphId);
    return setDoc(
      ref,
      {
        paragraph_id: gaze.paragraphId,
        dwell_time: gaze.dwellTime,
        is_reached: gaze.isReached,
        last_updated: Timestamp.now(),
      },
      { merge: true }
    );
  });
  await Promise.all(writes);
}

/**
 * セッションのステータス変化を監視する
 * onSnapshotで変化を受け取り、コールバックに渡す
 */
export function watchSessionStatus(
  sessionId: string,
  callback: (status: string) => void
): () => void {
  const ref = doc(db, "Patients", sessionId);
  return onSnapshot(ref, (snap) => {
    const data = snap.data();
    if (data?.status) {
      callback(data.status as string);
    }
  });
}
