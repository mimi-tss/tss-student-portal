import ExercisesClient from "./exercises-client";
import styles from "../../admin.module.css";

// Exercises library catalog management (TSS_App_Spec_1.md section 8 admin
// bullet: "add/edit the mp3 catalog coaches assign from").
export default function AdminExercisesPage() {
  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Exercises Library</h1>
      <ExercisesClient />
    </main>
  );
}
