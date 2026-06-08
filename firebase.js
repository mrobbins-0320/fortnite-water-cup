import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAX8YQEy4Cbients7OyymQyCS5SUBbEMK8",
  authDomain: "fortnite-water-cup.firebaseapp.com",
  projectId: "fortnite-water-cup",
  storageBucket: "fortnite-water-cup.firebasestorage.app",
  messagingSenderId: "269336324522",
  appId: "1:269336324522:web:9950018d52cb083433a3d3"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
