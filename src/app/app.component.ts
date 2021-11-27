import { Component, OnInit } from "@angular/core";
import type { User } from "@angular/fire/auth";
import {
  Auth,
  browserSessionPersistence,
  signInAnonymously,
  user,
} from "@angular/fire/auth";
import type { DocumentData } from "@angular/fire/firestore";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  docSnapshots,
  Firestore,
  serverTimestamp,
  updateDoc,
} from "@angular/fire/firestore";
import { Title } from "@angular/platform-browser";
import { ActivatedRoute, Router } from "@angular/router";
import {
  combineLatest,
  delay,
  delayWhen,
  filter,
  first,
  from,
  map,
  mapTo,
  merge,
  Observable,
  of,
  ReplaySubject,
  share,
  startWith,
  Subject,
  switchMap,
} from "rxjs";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit {
  public roomId$: Observable<string>;
  public roomData$: Observable<DocumentData>;
  public roomExist$: Observable<boolean>;
  #mainSwitchSubject$ = new Subject<void>();
  public mainSwitch$ = this.#mainSwitchSubject$.pipe(
    startWith(undefined),
    switchMap(() => merge(of(false), of(true).pipe(delay(1))))
  );

  constructor(
    private activatedRoute: ActivatedRoute,
    private fireAuth: Auth,
    private firestore: Firestore,
    private router: Router,
    private titleService: Title
  ) {
    this.fireAuth.setPersistence(browserSessionPersistence);
    this.roomId$ = this.activatedRoute.fragment.pipe(
      filter(
        (fragment): fragment is string => fragment !== null && fragment !== ""
      )
    );
    const roomRaw$ = combineLatest([
      this.roomId$,
      user(this.fireAuth).pipe(filter((user): user is User => user !== null)),
    ]).pipe(
      delayWhen(([roomId, user]) =>
        from(
          updateDoc(doc(this.firestore, `/rooms/${roomId}`), {
            members: arrayUnion(user.uid),
          }).catch(() => undefined)
        )
      ),
      switchMap(([roomId]) =>
        docSnapshots(doc(this.firestore, `/rooms/${roomId}`))
      ),
      share({
        connector: () => new ReplaySubject(1),
        resetOnComplete: true,
        resetOnError: true,
        resetOnRefCountZero: true,
      })
    );
    this.roomData$ = roomRaw$.pipe(
      map((snapshot) => snapshot.data()),
      filter((data): data is DocumentData => data !== undefined)
    );
    this.roomExist$ = roomRaw$.pipe(map((snapshot) => snapshot.exists()));

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

  public home(): void {
    this.router.navigate(["/"]).then(() => this.#mainSwitchSubject$.next());
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
          addDoc(collection(this.firestore, "rooms"), {
            createdAt: serverTimestamp(),
            createdBy: this.fireAuth.currentUser?.uid,
            members: [this.fireAuth.currentUser?.uid],
          })
        ),
        map((ref) => ref.id),
        first(),
        filter((roomId): roomId is string => roomId !== null)
      )
      .subscribe((roomId) => {
        this.router.navigate(["/"], { fragment: roomId });
      });
  }
}
