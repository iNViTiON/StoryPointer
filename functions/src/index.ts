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
    return admin.firestore().doc(`users/${user.uid}`).set(
      {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

export const removeUser = functions
  .runWith(runWith128MB)
  .auth.user()
  .onDelete((user: admin.auth.UserRecord) => {
    functions.logger.info(
      `User ${user.uid} deleted at ${user.metadata.lastSignInTime}`
    );
    return admin.firestore().doc(`users/${user.uid}`).delete();
  });

export const removeOfflineUser = functions
  .runWith(runWith128MB)
  .database.ref("/presence/users/{uid}")
  .onDelete((_snapshot, context) => {
    return admin
      .firestore()
      .collection("rooms")
      .where("members", "array-contains", context.params.uid)
      .get()
      .then((result) => result.docs)
      .then((rooms) => {
        functions.logger.info(
          `Remove user ${context.params.uid} from ${rooms.length} room(s)`
        );
        return Promise.all(
          rooms.map((room) =>
            room.ref.update({
              members: admin.firestore.FieldValue.arrayRemove(
                context.params.uid
              ),
            })
          )
        );
      });
  });
