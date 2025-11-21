// functions/src/reviewsAggregate.ts
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

const db = admin.firestore();

export const onReviewCreated = onDocumentCreated(
  "results/{resultId}/reviews/{reviewId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const rating = snap.data().rating as number;
    const resultId = event.params.resultId as string;
    const resultRef = db.collection("results").doc(resultId);

    await db.runTransaction(async (tx) => {
      const doc = await tx.get(resultRef);
      const data = doc.exists ? doc.data()! : {};

      const prevCount = (data.ratingCount as number | undefined) ?? 0;
      const prevSum = (data.ratingSum as number | undefined) ?? 0;

      const newCount = prevCount + 1;
      const newSum = prevSum + rating;
      const newAvg = newSum / newCount;

      tx.set(
        resultRef,
        {
          ratingCount: newCount,
          ratingSum: newSum,
          ratingAvg: newAvg,
        },
        { merge: true }
      );
    });
  }
);
