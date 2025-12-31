import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, arrayRemove, deleteDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCSwJqc4aLCUG_HSEhw4KoA056Qd2y1CB4",
  authDomain: "dungeonmind-aa529.firebaseapp.com",
  projectId: "dungeonmind-aa529",
  storageBucket: "dungeonmind-aa529.firebasestorage.app",
  messagingSenderId: "839802457564",
  appId: "1:839802457564:web:97aa6ea99190aa59acd319",
  measurementId: "G-Z0TEJSQ0WF"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc, onSnapshot };