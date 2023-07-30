import { Component, OnInit, inject } from "@angular/core";
import type { User } from "@angular/fire/auth";
import {
  Auth,
  browserSessionPersistence,
  signInAnonymously,
  user
} from "@angular/fire/auth";
import { Database, objectVal, onDisconnect, ref, set } from "@angular/fire/database";
import type { CollectionReference, Timestamp } from "@angular/fire/firestore";
import {
  Firestore,
  addDoc,
  arrayUnion,
  collection,
  deleteField,
  doc,
  docSnapshots,
  increment,
  serverTimestamp,
  writeBatch
} from "@angular/fire/firestore";
import { Title } from "@angular/platform-browser";
import { ActivatedRoute, Router } from "@angular/router";
import {
  Observable,
  ReplaySubject,
  Subject,
  combineLatest,
  combineLatestWith,
  delay,
  delayWhen,
  filter,
  first,
  from,
  map,
  merge,
  of,
  retry,
  share,
  skip,
  startWith,
  switchMap,
  tap,
  withLatestFrom
} from "rxjs";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit {
  private activatedRoute = inject(ActivatedRoute);
  private fireAuth = inject(Auth);
  private rtdb = inject(Database);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private titleService = inject(Title)

  #mainSwitchSubject$ = new Subject<void>();
  public mainSwitch$ = this.#mainSwitchSubject$.pipe(
    startWith(undefined),
    switchMap(() => merge(of(false), of(true).pipe(delay(1))))
  );

  public debug$: Observable<boolean>;

  public isRtdbOnline$: Observable<boolean>;

  public roomId$: Observable<string>;
  public roomData$: Observable<RoomData>;
  public roomExist$: Observable<boolean>;
  public roomVoteCount$: Observable<number>;
  public roomVoteResult$: Observable<null | RoomVoteData["votes"]>;
  public userData$: Observable<UserData>;
  public userId$: Observable<string>;
  public voteData$: Observable<{
    vote: undefined | string;
    votes: null | RoomVoteData["votes"];
  }>;

  private roomCollection: CollectionReference<RoomData>;
  private userCollection: CollectionReference<UserData>;

  public points = ["½", "1", "2", "3", "5", "8", "13"];

  constructor() {
    this.debug$ = this.activatedRoute.queryParamMap.pipe(
      map((params) => params.get("debug")),
      map((debug) => debug === "true")
    );
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
    this.userId$ = user(this.fireAuth).pipe(map((user) => user?.uid ?? ""));
    this.isRtdbOnline$
      .pipe(
        filter((isOnline) => isOnline),
        switchMap(() => this.userId$),
        map((userId) => ref(this.rtdb, `presence/users/${userId}`))
      )
      .subscribe((ref) =>
        onDisconnect(ref)
          .remove()
          .then(() => set(ref, true))
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
    user(this.fireAuth)
      .pipe(
        filter((user): user is User => user !== null),
        combineLatestWith(this.roomId$),
        switchMap(([user, roomId]) => {
          const batch = writeBatch(this.firestore);
          batch.update(doc<RoomData>(this.roomCollection, roomId), {
            members: arrayUnion(user.uid),
          });
          batch.update(
            doc<UserData>(this.userCollection, user.uid),
            `forRoom`,
            roomId
          );
          return batch.commit();
        }),
        retry({ delay: (err$) => err$.pipe(delay(100)) }),
        first()
      )
      .subscribe();
    user(this.fireAuth)
      .pipe(
        filter((user): user is User => user !== null),
        combineLatestWith(this.roomId$),
        switchMap(([user, roomId]) =>
          docSnapshots(doc<RoomData>(this.roomCollection, roomId)).pipe(
            retry({
              delay: (err$) => err$.pipe(
                delayWhen(() => {
                  const batch = writeBatch(this.firestore);
                  batch.update(doc<RoomData>(this.roomCollection, roomId), {
                    members: arrayUnion(user.uid),
                  });
                  batch.update(
                    doc<UserData>(this.userCollection, user.uid),
                    `forRoom`,
                    roomId
                  );
                  return batch.commit();
                })
              )
            })
          )
        ),
        retry({ delay: (err$) => err$.pipe(delay(100)) })
      )
      .subscribe();
    const roomRaw$ = combineLatest([
      this.roomId$,
      user(this.fireAuth).pipe(filter((user): user is User => user !== null)),
    ]).pipe(
      switchMap(([roomId]) =>
        docSnapshots(doc<RoomData>(this.roomCollection, roomId))
      ),
      retry({ delay: (err) => err.pipe(delay(1000)) }),
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
    this.roomVoteResult$ = roomRaw$.pipe(
      // check pending write to prevent local data reveal when DB not write yet
      map((snapshot) => !snapshot.metadata.hasPendingWrites && snapshot.data()),
      filter((data): data is false | RoomData => data !== undefined),
      map((data) => data !== false && data.members.length <= (data.voteCount ?? 0)),
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
        reveal
          ? docSnapshots(voteDoc).pipe(map((snapshot) => snapshot?.data()))
          : of(undefined)
      ),
      map((roomVoteData) => roomVoteData?.votes ?? null),
      retry({
        delay: (err) =>
          err.pipe(
            delay(30),
            tap(() => console.warn("retry"))
          )
      }
      )
    );
    this.voteData$ = combineLatest({
      vote: this.userData$.pipe(map(userData => userData.vote)),
      votes: this.roomVoteResult$,
    }).pipe(
      startWith({
        vote: undefined,
        votes: null,
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
        switchMap(() => user(this.fireAuth)),
        filter((user) => user !== null),
        first(),
        switchMap(() =>
          addDoc(collection(this.firestore, "rooms"), {
            createdAt: serverTimestamp(),
            createdBy: this.fireAuth.currentUser?.uid,
            members: [this.fireAuth.currentUser?.uid],
          })
        ),
        map((ref) => ref.id),
        filter((roomId): roomId is string => roomId !== null),
        retry({ delay: (err$) => err$.pipe(delay(100)) })
      )
      .subscribe((roomId) => {
        this.router.navigate(["/"], { fragment: roomId });
      });
  }

  public vote(n: string): void {
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

  public reset(): void {
    combineLatest([this.roomId$, this.roomData$])
      .pipe(first())
      .subscribe(([roomId, roomData]) => {
        const batch = writeBatch(this.firestore);
        const voteCollection = collection(
          this.firestore,
          `/rooms/${roomId}/vote`
        ) as CollectionReference<RoomVoteData>;
        const roomDoc = doc<RoomData>(this.roomCollection, roomId);
        const voteDoc = doc<RoomVoteData>(voteCollection, `vote`);
        batch.update(roomDoc, `voteCount`, deleteField());
        batch.delete(voteDoc);
        for (const member of roomData.members) {
          const userDoc = doc<UserData>(this.userCollection, member);
          batch.update(userDoc, `vote`, deleteField());
        }
        batch.commit();
      });
  }
}

interface UserData {
  createdAt: Timestamp;
  forRoom?: string;
  vote?: string;
}

interface RoomData {
  createdAt: Timestamp;
  createdBy: string;
  members: string[];
  voteCount?: number;
}

interface RoomVoteData {
  for: string;
  votes: { [key: string]: number };
}
