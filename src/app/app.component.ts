import { Component, OnInit, inject, signal } from "@angular/core";
import type { User } from "@angular/fire/auth";
import {
  Auth,
  browserSessionPersistence,
  signInAnonymously,
  user
} from "@angular/fire/auth";
import { Database, objectVal, onDisconnect, ref, set } from "@angular/fire/database";
import type { CollectionReference, DocumentData, DocumentReference, Timestamp, WriteBatch } from "@angular/fire/firestore";
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
import { shareLatest } from "@invition/rxjs-sharelatest";
import {
  EMPTY,
  Observable,
  Subject,
  combineLatest,
  combineLatestWith,
  debounceTime,
  defer,
  delay,
  distinctUntilChanged,
  filter,
  first,
  map,
  merge,
  of,
  retry,
  skip,
  startWith,
  switchMap,
  timer,
  withLatestFrom
} from "rxjs";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly fireAuth = inject(Auth);
  private readonly rtdb = inject(Database);
  private readonly firestore = inject(Firestore);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title)

  readonly #mainSwitchSubject$ = new Subject<void>();
  public readonly mainSwitch$ = this.#mainSwitchSubject$.pipe(
    startWith(undefined),
    switchMap(() => merge(of(false), of(true).pipe(delay(1))))
  );

  public readonly debug$: Observable<boolean>;

  public readonly isRtdbOnline$: Observable<boolean>;

  public readonly showVoted = signal(true);

  public readonly roomId$: Observable<string | null>;
  public readonly roomData$: Observable<RoomData>;
  public readonly roomExist$: Observable<boolean>;
  public readonly roomVoteCount$: Observable<number>;
  public readonly roomVoteResult$: Observable<null | RoomVoteData["votes"]>;
  public readonly loggedIn$: Observable<boolean>;
  public readonly userData$: Observable<UserData>;
  public readonly userId$: Observable<string>;
  public readonly voteData$: Observable<{
    vote: undefined | string;
    votes: null | RoomVoteData["votes"];
  }>;

  private readonly roomCollection: CollectionReference<RoomData>;
  private readonly userCollection: CollectionReference<UserData>;

  public readonly points = ["½", "1", "2", "3", "5", "8", "13"];

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
      shareLatest()
    );
    this.loggedIn$ = user(this.fireAuth).pipe(map((user) => user !== null), startWith(false));
    this.userId$ = user(this.fireAuth).pipe(map((user) => user?.uid ?? ""));
    this.isRtdbOnline$
      .pipe(
        filter((isOnline) => isOnline),
        switchMap(() => this.userId$),
        map((userId) => ref(this.rtdb, `presence/users/${userId}`)),
        retry({ delay: 100 }),
      )
      .subscribe((ref) =>
        onDisconnect(ref)
          .remove()
          .then(() => set(ref, true))
      );
    this.userData$ = user(this.fireAuth).pipe(
      filter((user): user is User => user !== null),
      switchMap((user) =>
        docSnapshots(doc<UserData, DocumentData>(this.userCollection, user.uid))
      ),
      map((snapshot) => snapshot.data()),
      filter((data): data is UserData => data !== undefined),
      shareLatest(),
    );
    this.roomId$ = this.activatedRoute.fragment.pipe(distinctUntilChanged(),);
    user(this.fireAuth)
      .pipe(
        filter((user): user is User => user !== null),
        combineLatestWith(this.roomId$),
        switchMap(([user, roomId]) => {
          if (roomId === null) return EMPTY;

          const batch = writeBatch(this.firestore);
          batch.update(doc<RoomData, DocumentData>(this.roomCollection, roomId), {
            members: arrayUnion(user.uid),
          });
          batch.update(
            doc<UserData, DocumentData>(this.userCollection, user.uid),
            `forRoom`,
            roomId
          );
          return defer(() => batch.commit());
        }),
        retry({ delay: 100 }),
      )
      .subscribe();
    user(this.fireAuth)
      .pipe(
        filter((user): user is User => user !== null),
        combineLatestWith(this.roomId$),
        switchMap(([user, roomId]) =>
          roomId === null
            ? EMPTY
            : docSnapshots(doc<RoomData, DocumentData>(this.roomCollection, roomId)).pipe(
              retry({
                delay: () => {
                  const batch = writeBatch(this.firestore);
                  batch.update(doc<RoomData, DocumentData>(this.roomCollection, roomId), {
                    members: arrayUnion(user.uid),
                  });
                  batch.update(
                    doc<UserData, DocumentData>(this.userCollection, user.uid),
                    `forRoom`,
                    roomId
                  );
                  return defer(() => batch.commit());
                }
              })
            )
        ),
        retry({ delay: 100 })
      )
      .subscribe();
    const roomRaw$ = combineLatest([
      this.roomId$,
      user(this.fireAuth).pipe(filter((user): user is User => user !== null)),
    ]).pipe(
      switchMap(([roomId]) =>
        roomId === null
          ? EMPTY
          : docSnapshots(doc<RoomData, DocumentData>(this.roomCollection, roomId))
      ),
      retry({ delay: 1000 }),
      shareLatest(),
    );
    this.roomData$ = roomRaw$.pipe(
      map((snapshot) => snapshot.data()),
      filter((data): data is RoomData => data !== undefined)
    );
    this.roomExist$ = roomRaw$.pipe(map((snapshot) => snapshot.exists()));
    this.roomVoteCount$ = this.roomData$.pipe(
      debounceTime(100),
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
      debounceTime(100),
      switchMap(([reveal, voteDoc]) =>
        reveal
          ? docSnapshots(voteDoc).pipe(map((snapshot) => snapshot?.data()))
          : of(undefined)
      ),
      map((roomVoteData) => roomVoteData?.votes ?? null),
      retry({ delay: () => (console.warn('retry'), timer(30)) }),
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
      .pipe(filter((user) => user === null), retry({ delay: 100 }))
      .subscribe(() => signInAnonymously(this.fireAuth));

    timer(100).pipe(
      switchMap(() => this.activatedRoute.fragment),
      map((fragment) => fragment === null || fragment === ""),
      filter(isNotInHome => isNotInHome),
      switchMap(() => user(this.fireAuth).pipe(first())),
      filter((user): user is User => user !== null),
    ).subscribe(async () => {
      console.log('logout');
      await this.fireAuth.signOut();
    });
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
        retry({ delay: 100 }),
      )
      .subscribe((roomId) => {
        this.router.navigate(["/"], { fragment: roomId });
      });
  }

  public vote(n: string): void {
    combineLatest([
      this.roomId$,
      user(this.fireAuth).pipe(filter((user): user is User => user !== null)),
      this.userData$.pipe(map((data) => data.vote)),
    ])
      .pipe(first())
      .subscribe(async ([roomId, user, currentVote]) => {
        if (roomId === null) return;
        const batch = writeBatch(this.firestore);
        const voteCollection = collection(
          this.firestore,
          `/rooms/${roomId}/vote`
        ) as CollectionReference<RoomVoteData>;
        const roomDoc = doc<RoomData, DocumentData>(this.roomCollection, roomId);
        const voteDoc = doc<RoomVoteData, DocumentData>(voteCollection, `vote`);
        const userDoc = doc<UserData, DocumentData>(this.userCollection, user.uid);

        this.prepareVoteBatch(currentVote, n, batch, roomDoc, voteDoc, userDoc);

        let rebatch: WriteBatch | undefined; // after delete
        if (currentVote !== undefined) {
          rebatch = writeBatch(this.firestore);
          this.prepareVoteBatch(undefined, n, rebatch, roomDoc, voteDoc, userDoc);
        }
        await this.commitVote(batch, roomDoc, voteDoc, n, userDoc);
        if (rebatch) await this.commitVote(rebatch, roomDoc, voteDoc, n, userDoc);
      });
  }

  private prepareVoteBatch = async (currentVote: string | undefined, n: string, batch: WriteBatch, roomDoc: DocumentReference<RoomData, DocumentData>, voteDoc: DocumentReference<RoomVoteData, DocumentData>, userDoc: DocumentReference<UserData, DocumentData>) => {
    const isVote = currentVote === undefined;
    const forv = isVote ? n : currentVote;
    batch.update(roomDoc, `voteCount`, increment(isVote ? 1 : -1));
    batch.update(voteDoc, `votes.${forv}`, increment(isVote ? 1 : -1));
    batch.update(voteDoc, `for`, forv);
    batch.update(userDoc, `vote`, isVote ? n : deleteField());
  }

  private commitVote = async (batch: WriteBatch, roomDoc: DocumentReference<RoomData, DocumentData>, voteDoc: DocumentReference<RoomVoteData, DocumentData>, n: string, userDoc: DocumentReference<UserData, DocumentData>) => {
    try {
      await batch.commit();
    } catch (err) {
      if ((err as { code?: string; })?.code !== `not-found`) {
        throw err;
      }
      // first voter
      const createBatch = writeBatch(this.firestore);
      createBatch.update(roomDoc, `voteCount`, 1);
      createBatch.set(voteDoc, { votes: { [n]: 1 }, for: n });
      createBatch.update(userDoc, `vote`, n);
      await createBatch.commit();
    }
  }

  public reset(): void {
    combineLatest([this.roomId$, this.roomData$])
      .pipe(first())
      .subscribe(([roomId, roomData]) => {
        if (roomId === null) return;
        const batch = writeBatch(this.firestore);
        const voteCollection = collection(
          this.firestore,
          `/rooms/${roomId}/vote`
        ) as CollectionReference<RoomVoteData>;
        const roomDoc = doc<RoomData, DocumentData>(this.roomCollection, roomId);
        const voteDoc = doc<RoomVoteData, DocumentData>(voteCollection, `vote`);
        batch.update(roomDoc, `voteCount`, deleteField());
        batch.delete(voteDoc);
        for (const member of roomData.members) {
          const userDoc = doc<UserData, DocumentData>(this.userCollection, member);
          batch.update(userDoc, `vote`, deleteField());
        }
        batch.commit();
      });
  }

  public readonly toggleVoted = (): void => this.showVoted.update((show) => !show);
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
