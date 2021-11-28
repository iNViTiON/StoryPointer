// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  firebase: {
    projectId: "invition-storypointer",
    appId: "1:787149245832:web:8b4449dccb6606f3df3e3d",
    databaseURL:
      "https://invition-storypointer-default-rtdb.asia-southeast1.firebasedatabase.app",
    storageBucket: "invition-storypointer.appspot.com",
    locationId: "asia-southeast1",
    apiKey: "AIzaSyCGc4Igf5wuMaUUyDZaKs8B1WpZ6o8INFw",
    authDomain: "invition-storypointer.firebaseapp.com",
    messagingSenderId: "787149245832",
  },
  useEmulators: true,
  production: false,
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
