import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD0O9Ltsmzo839olwZjbWJJiHCEncQquBY",
  authDomain: "studyflow-86874.firebaseapp.com",
  projectId: "studyflow-86874",
  storageBucket: "studyflow-86874.appspot.com",
  messagingSenderId: "944537286253",
  appId: "1:944537286253:web:e1c220338f17d194ab3164"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
