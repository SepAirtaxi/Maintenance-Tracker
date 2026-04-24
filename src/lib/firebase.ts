import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCoWyXHGKvS12Ln_dHdC_tnMXTDyEuGfI8",
  authDomain: "maintenancetracker4000.firebaseapp.com",
  projectId: "maintenancetracker4000",
  storageBucket: "maintenancetracker4000.firebasestorage.app",
  messagingSenderId: "1035097408497",
  appId: "1:1035097408497:web:61c5b44abf114284e0fa50",
  measurementId: "G-18FH15FJ9B",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
