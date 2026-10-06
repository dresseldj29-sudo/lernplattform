import firebaseConfig from "./firebase-config.js";

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";


/* ========================================
   FIREBASE
======================================== */

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


/* ========================================
   GLOBALE VARIABLEN
======================================== */

let currentUser = null;
let currentProfile = null;

let selectedClass = null;

let pendingStudentInvite = null;


/* ========================================
   HILFSFUNKTIONEN
======================================== */

window.showPage = function (pageId) {

  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  const page = document.getElementById(pageId);

  if (page) {
    page.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
};


function setMessage(id, text, type = "") {

  const element = document.getElementById(id);

  if (!element) return;

  element.textContent = text;

  element.className = "message";

  if (type) {
    element.classList.add(type);
  }
}


function normalizeUsername(username) {

  return username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 20);
}


/*
  Firebase Auth arbeitet hier intern mit einer
  technischen E-Mail-Adresse.

  Der Schüler sieht diese E-Mail-Adresse niemals.
  Für ihn bleibt der Benutzername der Login-Name.
*/

function studentAuthEmail(username) {

  return `${normalizeUsername(username)}@student.lernraum.local`;
}


function generateCode() {

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let result = "SCH-";

  for (let i = 0; i < 6; i++) {

    result += chars[
      Math.floor(Math.random() * chars.length)
    ];

  }

  return result;
}


function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


window.togglePassword = function (id) {

  const input = document.getElementById(id);

  if (!input) return;

  input.type =
    input.type === "password"
      ? "text"
      : "password";
};


function friendlyFirebaseError(error) {

  const code = error?.code || "";

  const errors = {

    "auth/email-already-in-use":
      "Diese E-Mail-Adresse wird bereits verwendet.",

    "auth/invalid-email":
      "Die E-Mail-Adresse ist ungültig.",

    "auth/weak-password":
      "Das Passwort muss mindestens 6 Zeichen haben.",

    "auth/invalid-credential":
      "E-Mail oder Passwort ist falsch.",

    "auth/user-not-found":
      "Dieses Konto wurde nicht gefunden.",

    "auth/wrong-password":
      "Das Passwort ist falsch.",

    "auth/too-many-requests":
      "Zu viele Versuche. Bitte später erneut versuchen.",

    "auth/network-request-failed":
      "Netzwerkfehler. Prüfe deine Internetverbindung."

  };

  return errors[code] ||
    error?.message ||
    "Ein unbekannter Fehler ist aufgetreten.";
}


/* ========================================
   LEHRER LOGIN / REGISTRIERUNG
======================================== */

window.switchTeacherMode = function(mode) {

  const loginForm =
    document.getElementById("teacherLoginForm");

  const registerForm =
    document.getElementById("teacherRegisterForm");

  const loginTab =
    document.getElementById("loginTab");

  const registerTab =
    document.getElementById("registerTab");


  if (mode === "login") {

    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");

    loginTab.classList.add("active");
    registerTab.classList.remove("active");

  } else {

    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");

    loginTab.classList.remove("active");
    registerTab.classList.add("active");

  }

};


window.teacherRegister = async function(event) {

  event.preventDefault();

  const name =
    document.getElementById("teacherName")
      .value
      .trim();

  const email =
    document.getElementById("teacherEmail")
      .value
      .trim();

  const password =
    document.getElementById("teacherPassword")
      .value;


  setMessage(
    "teacherAuthMessage",
    "Konto wird erstellt..."
  );


  try {

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    const uid = credential.user.uid;


    await setDoc(
      doc(db, "users", uid),
      {
        uid: uid,
        name: name,
        email: email,
        role: "teacher",
        createdAt: serverTimestamp()
      }
    );


    setMessage(
      "teacherAuthMessage",
      "Konto erfolgreich erstellt.",
      "success"
    );


    await loadCurrentUser();


  } catch (error) {

    console.error(error);

    setMessage(
      "teacherAuthMessage",
      friendlyFirebaseError(error),
      "error"
    );

  }

};


window.teacherLogin = async function(event) {

  event.preventDefault();

  const email =
    document.getElementById("teacherLoginEmail")
      .value
      .trim();

  const password =
    document.getElementById("teacherLoginPassword")
      .value;


  setMessage(
    "teacherAuthMessage",
    "Anmeldung läuft..."
  );


  try {

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );


    setMessage(
      "teacherAuthMessage",
      "Erfolgreich angemeldet.",
      "success"
    );


  } catch (error) {

    console.error(error);

    setMessage(
      "teacherAuthMessage",
      friendlyFirebaseError(error),
      "error"
    );

  }

};


/* ========================================
   AKTUELLEN USER LADEN
======================================== */

async function loadCurrentUser() {

  if (!auth.currentUser) return;

  currentUser = auth.currentUser;


  const profileRef =
    doc(
      db,
      "users",
      currentUser.uid
    );


  const profileSnap =
    await getDoc(profileRef);


  if (!profileSnap.exists()) {

    console.error(
      "Kein Benutzerprofil gefunden."
    );

    await signOut(auth);

    showPage("startPage");

    return;

  }


  currentProfile =
    profileSnap.data();


  if (currentProfile.role === "teacher") {

    document.getElementById(
      "teacherDisplayName"
    ).textContent =
      currentProfile.name || "Lehrer";


    showPage("teacherDashboardPage");

    await loadTeacherClasses();

  }


  else if (currentProfile.role === "student") {

    document.getElementById(
      "studentDisplayName"
    ).textContent =
      currentProfile.name || "Schüler";


    document.getElementById(
      "studentWelcomeName"
    ).textContent =
      currentProfile.name || "Schüler";


    showPage("studentDashboardPage");

    await loadStudentClass();

  }

}


/* ========================================
   LEHRER: KLASSEN
======================================== */

async function loadTeacherClasses() {

  if (!currentUser) return;


  const q = query(
    collection(db, "classes"),
    where(
      "teacherId",
      "==",
      currentUser.uid
    )
  );


  const snapshot =
    await getDocs(q);


  const container =
    document.getElementById(
      "teacherClasses"
    );


  container.innerHTML = "";


  document.getElementById(
    "teacherClassCount"
  ).textContent =
    snapshot.size;


  let totalStudents = 0;


  if (snapshot.empty) {

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏫</div>
        <h3>Noch keine Klasse</h3>
        <p>
          Erstelle deine erste Klasse und füge Schüler hinzu.
        </p>
      </div>
    `;

    document.getElementById(
      "teacherStudentCount"
    ).textContent = "0";

    return;

  }


  for (const classDoc of snapshot.docs) {

    const classData = classDoc.data();

    const studentQuery =
      query(
        collection(db, "studentInvites"),
        where(
          "classId",
          "==",
          classDoc.id
        )
      );


    const studentSnapshot =
      await getDocs(studentQuery);


    totalStudents +=
      studentSnapshot.size;


    const card =
      document.createElement("div");

    card.className =
      "class-card";


    card.innerHTML = `

      <div class="class-icon">
        🏫
      </div>

      <h3>
        ${escapeHTML(classData.name)}
      </h3>

      <p>
        ${escapeHTML(classData.subject)}
      </p>

      <div class="class-card-footer">

        <span>
          👥 ${studentSnapshot.size} Schüler
        </span>

        <button
          class="small-button"
          onclick="openClass('${classDoc.id}')"
        >
          Öffnen →
        </button>

      </div>

    `;


    container.appendChild(card);

  }


  document.getElementById(
    "teacherStudentCount"
  ).textContent =
    totalStudents;

}


/* ========================================
   KLASSE ERSTELLEN
======================================== */

window.openClassModal = function() {

  document
    .getElementById("classModal")
    .classList.add("open");

};


window.createClass = async function(event) {

  event.preventDefault();


  const name =
    document.getElementById("newClassName")
      .value
      .trim();

  const subject =
    document.getElementById("newClassSubject")
      .value
      .trim();


  if (!currentUser) return;


  setMessage(
    "classMessage",
    "Klasse wird erstellt..."
  );


  try {

    const classRef =
      await addDoc(
        collection(db, "classes"),
        {
          name: name,
          subject: subject,
          teacherId: currentUser.uid,
          createdAt: serverTimestamp()
        }
      );


    selectedClass = {
      id: classRef.id,
      name: name,
      subject: subject,
      teacherId: currentUser.uid
    };


    closeModal("classModal");


    document.getElementById(
      "newClassName"
    ).value = "";

    document.getElementById(
      "newClassSubject"
    ).value = "";


    await loadTeacherClasses();


    await openClass(classRef.id);


  } catch (error) {

    console.error(error);

    setMessage(
      "classMessage",
      friendlyFirebaseError(error),
      "error"
    );

  }

};


/* ========================================
   KLASSE ÖFFNEN
======================================== */

window.openClass = async function(classId) {

  try {

    const classRef =
      doc(
        db,
        "classes",
        classId
      );


    const classSnap =
      await getDoc(classRef);


    if (!classSnap.exists()) {

      alert("Klasse nicht gefunden.");

      return;

    }


    const data =
      classSnap.data();


    if (
      data.teacherId !==
      currentUser.uid
    ) {

      alert(
        "Du hast keinen Zugriff auf diese Klasse."
      );

      return;

    }


    selectedClass = {
      id: classSnap.id,
      ...data
    };


    document.getElementById(
      "selectedClassTitle"
    ).textContent =
      data.name;


    document.getElementById(
      "selectedClassSubtitle"
    ).textContent =
      data.subject;


    document.getElementById(
      "classNameLarge"
    ).textContent =
      data.name;


    document.getElementById(
      "classSubjectLarge"
    ).textContent =
      data.subject;


    document.getElementById(
      "classCodeDisplay"
    ).textContent =
      classId.slice(0, 8).toUpperCase();


    showPage("classPage");


    await loadStudents();

  } catch (error) {

    console.error(error);

  }

};


window.backToTeacherDashboard =
  async function() {

    showPage(
      "teacherDashboardPage"
    );

    await loadTeacherClasses();

  };


/* ========================================
   SCHÜLER-CODE ERSTELLEN
======================================== */

window.openStudentModal = function() {

  if (!selectedClass) {

    alert(
      "Bitte zuerst eine Klasse öffnen."
    );

    return;

  }


  document.getElementById(
    "newCodeResult"
  ).classList.add("hidden");


  document.getElementById(
    "studentMessage"
  ).textContent = "";


  document.getElementById(
    "newStudentName"
  ).value = "";


  document
    .getElementById("studentModal")
    .classList.add("open");

};


window.createStudentInvite =
  async function(event) {

    event.preventDefault();


    if (!selectedClass || !currentUser) {
      return;
    }


    const studentName =
      document.getElementById(
        "newStudentName"
      ).value.trim();


    if (!studentName) return;


    setMessage(
      "studentMessage",
      "Persönlicher Code wird erstellt..."
    );


    try {

      let code = "";

      let inviteId = "";


      /*
        Wir versuchen einen wirklich freien Code
        zu erzeugen.
      */

      for (let i = 0; i < 10; i++) {

        const candidate =
          generateCode();


        const q =
          query(
            collection(
              db,
              "studentInvites"
            ),
            where(
              "code",
              "==",
              candidate
            )
          );


        const existing =
          await getDocs(q);


        if (existing.empty) {

          code = candidate;

          break;

        }

      }


      if (!code) {

        throw new Error(
          "Kein freier Schülercode gefunden."
        );

      }


      const inviteRef =
        await addDoc(
          collection(
            db,
            "studentInvites"
          ),
          {
            code: code,
            classId: selectedClass.id,
            teacherId: currentUser.uid,
            studentName: studentName,
            status: "open",
            claimedBy: null,
            createdAt: serverTimestamp()
          }
        );


      inviteId = inviteRef.id;


      document.getElementById(
        "newStudentCode"
      ).textContent =
        code;


      document.getElementById(
        "newCodeResult"
      ).classList.remove("hidden");


      setMessage(
        "studentMessage",
        "Schüler erfolgreich angelegt.",
        "success"
      );


      await loadStudents();


    } catch (error) {

      console.error(error);

      setMessage(
        "studentMessage",
        error.message,
        "error"
      );

    }

  };


/* ========================================
   SCHÜLER LISTE
======================================== */

async function loadStudents() {

  if (!selectedClass) return;


  const q =
    query(
      collection(
        db,
        "studentInvites"
      ),
      where(
        "classId",
        "==",
        selectedClass.id
      )
    );


  const snapshot =
    await getDocs(q);


  const container =
    document.getElementById(
      "studentList"
    );


  container.innerHTML = "";


  if (snapshot.empty) {

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👨‍🎓</div>
        <h3>Noch keine Schüler</h3>
        <p>
          Füge deinen ersten Schüler hinzu.
        </p>
      </div>
    `;

    return;

  }


  snapshot.docs.forEach(studentDoc => {

    const student =
      studentDoc.data();


    const initial =
      student.studentName
        .charAt(0)
        .toUpperCase();


    const row =
      document.createElement("div");


    row.className =
      "student-row";


    const status =
      student.status === "claimed"
        ? "Konto erstellt"
        : "Code noch nicht verwendet";


    row.innerHTML = `

      <div class="student-left">

        <div class="avatar">
          ${escapeHTML(initial)}
        </div>

        <div>

          <strong>
            ${escapeHTML(student.studentName)}
          </strong>

          <span>
            ${status}
          </span>

        </div>

      </div>

      <div class="student-code">
        ${escapeHTML(student.code)}
      </div>

    `;


    container.appendChild(row);

  });

}


/* ========================================
   CODE PRÜFEN
======================================== */

window.checkStudentCode =
  async function(event) {

    event.preventDefault();


    const code =
      document.getElementById(
        "studentJoinCode"
      ).value
      .trim()
      .toUpperCase();


    if (!/^SCH-[A-Z0-9]{6}$/.test(code)) {

      setMessage(
        "studentJoinMessage",
        "Der Code muss ungefähr so aussehen: SCH-ABC123",
        "error"
      );

      return;

    }


    setMessage(
      "studentJoinMessage",
      "Code wird geprüft..."
    );


    try {

      const q =
        query(
          collection(
            db,
            "studentInvites"
          ),
          where(
            "code",
            "==",
            code
          )
        );


      const snapshot =
        await getDocs(q);


      if (snapshot.empty) {

        setMessage(
          "studentJoinMessage",
          "Dieser Schüler-Code existiert nicht.",
          "error"
        );

        return;

      }


      const inviteDoc =
        snapshot.docs[0];


      const invite =
        inviteDoc.data();


      if (invite.status === "claimed") {

        setMessage(
          "studentJoinMessage",
          "Dieser Code wurde bereits verwendet.",
          "error"
        );

        return;

      }


      pendingStudentInvite = {
        id: inviteDoc.id,
        ...invite
      };


      document.getElementById(
        "registerCodeDisplay"
      ).textContent =
        invite.code;


      document.getElementById(
        "registerClassDisplay"
      ).textContent =
        `Klasse: ${invite.classId}`;


      /*
        Der vom Lehrer eingetragene Schülername
        wird als Vorschlag eingesetzt.
      */

      document.getElementById(
        "studentName"
      ).value =
        invite.studentName || "";


      showPage(
        "studentRegisterPage"
      );


    } catch (error) {

      console.error(error);

      setMessage(
        "studentJoinMessage",
        friendlyFirebaseError(error),
        "error"
      );

    }

  };


/* ========================================
   SCHÜLER REGISTRIEREN
======================================== */

window.studentRegister =
  async function(event) {

    event.preventDefault();


    if (!pendingStudentInvite) {

      alert(
        "Kein gültiger Schüler-Code."
      );

      return;

    }


    const name =
      document.getElementById(
        "studentName"
      ).value.trim();


    const username =
      normalizeUsername(
        document.getElementById(
          "studentUsername"
        ).value
      );


    const password =
      document.getElementById(
        "studentPassword"
      ).value;


    const repeatPassword =
      document.getElementById(
        "studentPasswordRepeat"
      ).value;


    if (username.length < 3) {

      setMessage(
        "studentRegisterMessage",
        "Der Benutzername muss mindestens 3 Zeichen haben.",
        "error"
      );

      return;

    }


    if (password !== repeatPassword) {

      setMessage(
        "studentRegisterMessage",
        "Die Passwörter stimmen nicht überein.",
        "error"
      );

      return;

    }


    if (password.length < 6) {

      setMessage(
        "studentRegisterMessage",
        "Das Passwort muss mindestens 6 Zeichen haben.",
        "error"
      );

      return;

    }


    setMessage(
      "studentRegisterMessage",
      "Konto wird erstellt..."
    );


    try {

      /*
        Firebase Authentication
        erstellt das eigentliche Konto.
      */

      const credential =
        await createUserWithEmailAndPassword(
          auth,
          studentAuthEmail(username),
          password
        );


      const uid =
        credential.user.uid;


      /*
        Jetzt wird der Einladungscode
        atomar beansprucht.
      */

      const inviteRef =
        doc(
          db,
          "studentInvites",
          pendingStudentInvite.id
        );


      await runTransaction(
        db,
        async transaction => {

          const inviteSnap =
            await transaction.get(
              inviteRef
            );


          if (!inviteSnap.exists()) {

            throw new Error(
              "Der Schüler-Code existiert nicht mehr."
            );

          }


          const invite =
            inviteSnap.data();


          if (
            invite.status !== "open" ||
            invite.claimedBy
          ) {

            throw new Error(
              "Dieser Schüler-Code wurde bereits verwendet."
            );

          }


          transaction.update(
            inviteRef,
            {
              status: "claimed",
              claimedBy: uid,
              claimedAt: serverTimestamp(),
              username: username
            }
          );

        }
      );


      /*
        Schülerprofil
      */

      await setDoc(
        doc(
          db,
          "users",
          uid
        ),
        {
          uid: uid,
          name: name,
          username: username,
          role: "student",
          classId:
            pendingStudentInvite.classId,
          inviteId:
            pendingStudentInvite.id,
          teacherId:
            pendingStudentInvite.teacherId,
          createdAt:
            serverTimestamp()
        }
      );


      pendingStudentInvite = null;


      setMessage(
        "studentRegisterMessage",
        "Konto erfolgreich erstellt!",
        "success"
      );


      await loadCurrentUser();


    } catch (error) {

      console.error(error);

      /*
        Wenn die Registrierung funktioniert hat,
        aber das Firestore-Schreiben scheitert,
        bleibt der Auth-Account bestehen.

        Deshalb zeigen wir einen verständlichen Fehler.
      */

      setMessage(
        "studentRegisterMessage",
        friendlyFirebaseError(error),
        "error"
      );

    }

  };


/* ========================================
   SCHÜLER KLASSE
======================================== */

async function loadStudentClass() {

  if (
    !currentProfile ||
    !currentProfile.classId
  ) {

    document.getElementById(
      "studentClassName"
    ).textContent =
      "Keine Klasse";

    return;

  }


  const classSnap =
    await getDoc(
      doc(
        db,
        "classes",
        currentProfile.classId
      )
    );


  if (!classSnap.exists()) {

    document.getElementById(
      "studentClassName"
    ).textContent =
      "Klasse nicht gefunden";

    return;

  }


  const data =
    classSnap.data();


  document.getElementById(
    "studentClassName"
  ).textContent =
    data.name;


  document.getElementById(
    "studentClassSubject"
  ).textContent =
    data.subject;

}


/* ========================================
   CODE KOPIEREN
======================================== */

window.copyNewStudentCode =
  async function() {

    const code =
      document.getElementById(
        "newStudentCode"
      ).textContent;


    try {

      await navigator.clipboard.writeText(
        code
      );


      setMessage(
        "studentMessage",
        "Code wurde kopiert.",
        "success"
      );


    } catch {

      alert(
        `Schüler-Code: ${code}`
      );

    }

  };


/* ========================================
   MODALS
======================================== */

window.closeModal =
  function(id) {

    document
      .getElementById(id)
      .classList.remove("open");

  };


document.addEventListener(
  "click",
  event => {

    if (
      event.target.classList.contains(
        "modal"
      )
    ) {

      event.target.classList.remove(
        "open"
      );

    }

  }
);


/* ========================================
   LOGOUT
======================================== */

window.logout = async function() {

  await signOut(auth);

  currentUser = null;
  currentProfile = null;
  selectedClass = null;
  pendingStudentInvite = null;

  showPage("startPage");

};


/* ========================================
   AUTH STATUS
======================================== */

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      currentUser = null;
      currentProfile = null;

      return;

    }


    try {

      await loadCurrentUser();

    } catch (error) {

      console.error(
        "Fehler beim Laden:",
        error
      );

    }

  }
);
