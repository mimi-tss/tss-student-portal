import styles from "../../admin.module.css";

// Kajabi owns community content (TSS_App_Spec_1.md section 1), same
// link-out posture as the student/coach nav's Backstage link — no
// in-app community feed/moderation exists to build a real page around.
export default function AdminCommunityPage() {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>Backstage</h1>
      <div className={styles.panel}>
        <p className={styles.panelText}>
          The community lives on Kajabi, not in this app — there&apos;s no in-app feed or moderation queue to
          show here.
        </p>
        <a
          href={`${process.env.NEXT_PUBLIC_KAJABI_SITE_URL ?? ""}/products/communities/v2/backstagehub`}
          target="_self"
          className={styles.cta}
          style={{ marginTop: 12, display: "inline-block" }}
        >
          Open on Kajabi →
        </a>
      </div>
    </div>
  );
}
