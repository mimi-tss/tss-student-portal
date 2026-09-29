import styles from "../../student.module.css";

const EXIT_SURVEY_URL = "https://tally.so/r/5BMe0b";

function ExitSurveyLink() {
  return (
    <p className={styles.panelText} style={{ marginTop: 6 }}>
      <a href={EXIT_SURVEY_URL} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
        Please complete this quick exit survey
      </a>
    </p>
  );
}

// "Request to cancel" hands off to the account page's plan section
// (/billing/account#billing), where the actual request form lives. New tab
// on desktop; inside the Kajabi app, target="_blank" opens the phone's
// browser — same as the profile menu's Account/Billing links.
export default function PlanRequestsClient({ initialPending }: { initialPending: boolean }) {
  return (
    <div style={{ marginTop: 10 }}>
      {initialPending ? (
        <>
          <span className={styles.panelText}>Cancellation request pending</span>
          <ExitSurveyLink />
        </>
      ) : (
        <a href="/billing/account#billing" target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
          Request to cancel
        </a>
      )}
    </div>
  );
}
