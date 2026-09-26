import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";

const app = initializeApp({
  apiKey: "demo-key",
  projectId: "demo-ilma-doces",
  authDomain: "localhost",
});

const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });

const email = process.argv[2] || "ilmadoces370@gmail.com";
const senha = process.argv[3] || process.env.NEXT_PUBLIC_LOCAL_SENHA || "local1234";

const cred = await signInWithEmailAndPassword(auth, email, senha);
console.log(`login via SDK Firebase OK: ${cred.user.email}`);
