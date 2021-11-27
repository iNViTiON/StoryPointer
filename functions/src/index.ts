import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

admin.initializeApp();

export const logUserCreatedAt = functions.auth
  .user()
  .onCreate((user: admin.auth.UserRecord) => {
    functions.logger.info(
      `User ${user.uid} created at ${user.metadata.creationTime}`
    );
    admin
      .database()
      .ref(`users/${user.uid}`)
      .set(admin.database.ServerValue.TIMESTAMP);
  });

export const removeUser = functions.auth
  .user()
  .onDelete((user: admin.auth.UserRecord) => {
    functions.logger.info(
      `User ${user.uid} deleted at ${user.metadata.lastSignInTime}`
    );
    admin.database().ref(`users/${user.uid}`).remove();
  });
