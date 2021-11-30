import { Component, OnInit } from "@angular/core";
import type { User } from "@angular/fire/auth";
import {
  Auth,
  browserSessionPersistence,
  signInAnonymously,
  user,
} from "@angular/fire/auth";
import { Database, objectVal, ref } from "@angular/fire/database";
import type { CollectionReference, Timestamp } from "@angular/fire/firestore";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteField,
  doc,
  docSnapshots,
  Firestore,
  increment,
  serverTimestamp,
  writeBatch,
} from "@angular/fire/firestore";
import { Title } from "@angular/platform-browser";
import { ActivatedRoute, Router } from "@angular/router";
import {
  catchError,
  combineLatest,
  delay,
  delayWhen,
  filter,
  first,
  from,
  map,
  merge,
  Observable,
  of,
  ReplaySubject,
  share,
  skip,
  startWith,
  Subject,
  switchMap,
  withLatestFrom,
} from "rxjs";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit {
  #mainSwitchSubject$ = new Subject<void>();
  public mainSwitch$ = this.#mainSwitchSubject$.pipe(
    startWith(undefined),
    switchMap(() => merge(of(false), of(true).pipe(delay(1))))
  );

  public isRtdbOnline$: Observable<boolean>;

  public roomId$: Observable<string>;
  public roomData$: Observable<RoomData>;
  public roomExist$: Observable<boolean>;
  public roomVoteCount$: Observable<number>;
  public roomVoteResult$: Observable<null | Omit<RoomVoteData, `for`>>;
  public userData$: Observable<UserData>;

  private roomCollection: CollectionReference<RoomData>;
  private userCollection: CollectionReference<UserData>;

  public points = [0.5, 1, 2, 3, 5, 8, 13];

  constructor(
    private activatedRoute: ActivatedRoute,
    private fireAuth: Auth,
    private rtdb: Database,
    private firestore: Firestore,
    private router: Router,
    private titleService: Title
  ) {
    this.fireAuth.setPersistence(browserSessionPersistence);
    this.roomCollection = collection(
      this.firestore,
      "rooms"
    ) as CollectionReference<RoomData>;
    this.userCollection = collection(
      this.firestore,
      "users"
    ) as CollectionReference<UserData>;
    this.isRtdbOnline$ = objectVal<boolean>(
      ref(this.rtdb, ".info/connected")
    ).pipe(
      share({
        connector: () => new ReplaySubject<boolean>(1),
        resetOnComplete: true,
        resetOnError: true,
        resetOnRefCountZero: true,
      })
    );
    this.userData$ = user(this.fireAuth).pipe(
      filter((user): user is User => user !== null),
      switchMap((user) =>
        docSnapshots(doc<UserData>(this.userCollection, user.uid))
      ),
      map((snapshot) => snapshot.data()),
      filter((data): data is UserData => data !== undefined),
      share({
        connector: () => new ReplaySubject(1),
        resetOnComplete: true,
        resetOnError: true,
        resetOnRefCountZero: true,
      })
    );
    this.roomId$ = this.activatedRoute.fragment.pipe(
      filter(
        (fragment): fragment is string => fragment !== null && fragment !== ""
      )
    );
    const roomRaw$ = combineLatest([
      this.roomId$,
      user(this.fireAuth).pipe(filter((user): user is User => user !== null)),
    ]).pipe(
      delayWhen(([roomId, user]) => {
        const batch = writeBatch(this.firestore);
        batch.update(doc<RoomData>(this.roomCollection, roomId), {
          members: arrayUnion(user.uid),
        });
        batch.update(
          doc<UserData>(this.userCollection, user.uid),
          `forRoom`,
          roomId
        );
        return from(batch.commit().catch()).pipe(
          catchError(() => of(undefined))
        );
      }),
      switchMap(([roomId]) =>
        docSnapshots(doc<RoomData>(this.roomCollection, roomId))
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
      filter((data): data is RoomData => data !== undefined)
    );
    this.roomExist$ = roomRaw$.pipe(map((snapshot) => snapshot.exists()));
    this.roomVoteCount$ = this.roomData$.pipe(
      map((data) => data.voteCount ?? 0)
    );
    this.roomVoteResult$ = this.roomData$.pipe(
      map((data) => data.members.length === data.voteCount),
      withLatestFrom(
        this.roomId$.pipe(
          map((roomId) =>
            doc(
              collection(
                this.firestore,
                `/rooms/${roomId}/vote`
              ) as CollectionReference<RoomVoteData>,
              `vote`
            )
          )
        )
      ),
      switchMap(([reveal, voteDoc]) =>
        reveal ? docSnapshots(voteDoc) : of(undefined)
      ),
      map((snapshot) => snapshot?.data()),
      map((roomVoteData) => {
        if (roomVoteData !== undefined) {
          const { for: _for, ...omitFor } = roomVoteData;
          return omitFor;
        }
        return null;
      }),
      share({
        connector: () => new ReplaySubject(1),
        resetOnComplete: true,
        resetOnError: true,
        resetOnRefCountZero: true,
      })
    );

    user(this.fireAuth)
      .pipe(filter((user) => user === null))
      .subscribe(() => signInAnonymously(this.fireAuth));
  }

  public ngOnInit(): void {
    this.titleService.setTitle("Story Pointer");
    this.activatedRoute.fragment
      .pipe(
        skip(1),
        filter(
          (fragment): fragment is "" | null =>
            fragment === null || fragment === ""
        )
      )
      .subscribe(() => this.#mainSwitchSubject$.next());
  }

  public home(): void {
    this.router.navigate(["/"]);
  }

  public newRoom(): void {
    this.activatedRoute.fragment
      .pipe(
        first(),
        filter(
          (fragment): fragment is "" | null =>
            fragment === null || fragment === ""
        ),
        switchMap(() =>
          addDoc(collection(this.firestore, "rooms"), {
            createdAt: serverTimestamp(),
            createdBy: this.fireAuth.currentUser?.uid,
            members: [this.fireAuth.currentUser?.uid],
          })
        ),
        map((ref) => ref.id),
        filter((roomId): roomId is string => roomId !== null)
      )
      .subscribe((roomId) => {
        this.router.navigate(["/"], { fragment: roomId });
      });
  }

  public vote(n: number): void {
    combineLatest([
      this.roomId$,
      user(this.fireAuth).pipe(filter((user): user is User => user !== null)),
      this.userData$.pipe(map((data) => (data as any).vote)),
    ])
      .pipe(first())
      .subscribe(([roomId, user, currentVote]) => {
        const isVote = currentVote === undefined;
        const forv = isVote ? n : currentVote;
        const batch = writeBatch(this.firestore);
        const voteCollection = collection(
          this.firestore,
          `/rooms/${roomId}/vote`
        ) as CollectionReference<RoomVoteData>;
        const roomDoc = doc<RoomData>(this.roomCollection, roomId);
        const voteDoc = doc<RoomVoteData>(voteCollection, `vote`);
        const userDoc = doc<UserData>(this.userCollection, user.uid);
        batch.update(roomDoc, `voteCount`, increment(isVote ? 1 : -1));
        batch.update(voteDoc, `votes.${forv}`, increment(isVote ? 1 : -1));
        batch.update(voteDoc, `for`, forv);
        batch.update(userDoc, `vote`, isVote ? n : deleteField());
        batch
          .commit()
          .catch((err) => {
            if (err.code !== `not-found`) {
              throw err;
            }
            // first voter
            const createBatch = writeBatch(this.firestore);
            createBatch.update(roomDoc, `voteCount`, 1);
            createBatch.set(voteDoc, { votes: { [n]: 1 }, for: n });
            createBatch.update(userDoc, `vote`, n);
            return createBatch.commit();
          })
          .then(() => (isVote ? undefined : this.vote(n)));
      });
  }
}

interface UserData {
  createdAt: Timestamp;
  forRoom?: string;
  vote?: number;
}

interface RoomData {
  createdAt: Timestamp;
  createdBy: string;
  members: string[];
  voteCount?: number;
}

interface RoomVoteData {
  for: number;
  votes: { [key: number]: number };
}
