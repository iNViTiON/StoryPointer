import { Component, OnInit } from "@angular/core";
import type { User } from "@angular/fire/auth";
import {
  Auth,
  browserSessionPersistence,
  signInAnonymously,
  user,
} from "@angular/fire/auth";
import { Database, objectVal, push, ref } from "@angular/fire/database";
import { Title } from "@angular/platform-browser";
import { ActivatedRoute, Router } from "@angular/router";
import { filter, first, map, mapTo, Observable, switchMap } from "rxjs";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit {
  public roomId$: Observable<string>;
  public roomExist$: Observable<unknown>;

  constructor(
    private activatedRoute: ActivatedRoute,
    private fireAuth: Auth,
    private fireDatabase: Database,
    private router: Router,
    private titleService: Title
  ) {
    this.fireAuth.setPersistence(browserSessionPersistence);
    this.roomId$ = this.activatedRoute.fragment.pipe(
      filter(
        (fragment): fragment is string => fragment !== null && fragment !== ""
      )
    );
    this.roomExist$ = this.roomId$.pipe(
      switchMap((roomId) =>
        objectVal(ref(this.fireDatabase, `room/${roomId}/createdBy`))
      ),
      map((createdBy) => createdBy !== null)
    );

    user(this.fireAuth)
      .pipe(filter((user) => user === null))
      .subscribe(() => signInAnonymously(this.fireAuth));
    user(this.fireAuth)
      .pipe(filter((user): user is User => user !== null))
      .subscribe((user) => console.log(user));
  }

  public ngOnInit(): void {
    this.titleService.setTitle("Story Pointer");
  }

  public newRoom(): void {
    this.activatedRoute.fragment
      .pipe(
        first(),
        filter(
          (fragment): fragment is "" | null =>
            fragment === null || fragment === ""
        ),
        mapTo(true),
        switchMap(() =>
          push(ref(this.fireDatabase, "room"), {
            createdBy: this.fireAuth.currentUser?.uid,
          })
        ),
        map((ref) => ref.key),
        first(),
        filter((roomId): roomId is string => roomId !== null)
      )
      .subscribe((roomId) => {
        console.log(roomId);
        this.router.navigate(["/"], { fragment: roomId });
      });
  }
}
