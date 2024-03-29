import { RxPush } from "@rx-angular/template/push";
import { RxLet } from "@rx-angular/template/let";
import { RxFor } from "@rx-angular/template/for";
import { NgModule } from "@angular/core";
import { initializeApp, provideFirebaseApp } from "@angular/fire/app";
import { connectAuthEmulator, getAuth, provideAuth } from "@angular/fire/auth";
import {
  connectDatabaseEmulator,
  getDatabase,
  provideDatabase
} from "@angular/fire/database";
import {
  connectFirestoreEmulator,
  getFirestore,
  provideFirestore
} from "@angular/fire/firestore";
import { MatBadgeModule } from "@angular/material/badge";
import { MatButtonModule } from "@angular/material/button";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { RouterModule } from "@angular/router";
import { environment } from "../environments/environment";
import { AppComponent } from "./app.component";

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserAnimationsModule,
    BrowserModule,
    RxFor,
    RxLet,
    MatBadgeModule,
    MatButtonModule,
    RxPush,
    RouterModule.forRoot([]),
    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulators) {
        connectAuthEmulator(auth, "http://localhost:9099");
      }
      return auth;
    }),
    provideDatabase(() => {
      const database = getDatabase();
      if (environment.useEmulators) {
        connectDatabaseEmulator(database, "localhost", 9000);
      }
      return database;
    }),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => {
      const firestore = getFirestore();
      if (environment.useEmulators) {
        connectFirestoreEmulator(firestore, "localhost", 8080);
      }
      return firestore;
    }),
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule { }
