import * as admin from "firebase-admin";
import type { RuntimeOptions } from "firebase-functions";
import * as functions from "firebase-functions";

const runWith128MB: RuntimeOptions = {
  memory: "128MB",
};

admin.initializeApp();

export const logUserCreatedAt = functions
  .runWith(runWith128MB)
  .auth.user()
  .onCreate((user: admin.auth.UserRecord) => {
    functions.logger.info(
      `User ${user.uid} created at ${user.metadata.creationTime}`
    );
    admin.firestore().doc(`users/${user.uid}`).set({
      createdAt: admin.firestore.FieldValue.serverTimestamp,
    });
  });

export const removeUser = functions
  .runWith(runWith128MB)
  .auth.user()
  .onDelete((user: admin.auth.UserRecord) => {
    functions.logger.info(
      `User ${user.uid} deleted at ${user.metadata.lastSignInTime}`
    );
    admin.firestore().doc(`users/${user.uid}`).delete();
  });
