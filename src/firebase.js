import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  deleteDoc, 
  deleteField, 
  writeBatch 
} from "firebase/firestore";
// START CHANGE
import { getStorage } from "firebase/storage";
// END CHANGE

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
// START CHANGE: Export appId for CampaignContext
export const appId = firebaseConfig.appId;
// END CHANGE
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export { 
  signInWithPopup, 
// START CHANGE: Export anonymous auth for Lobby
  signInAnonymously,
// END CHANGE
  signOut, 
  onAuthStateChanged,
  doc, 
  setDoc, 
  getDoc, 
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  deleteDoc, 
  deleteField,
  writeBatch 
};