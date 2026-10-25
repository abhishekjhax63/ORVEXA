function NewsletterForm({ className }: { className?: string }) {
  return (
    <p className={className} role="status">
      Newsletter signup is unavailable because no mailing-list integration is configured. No email address is collected
      here.
    </p>
  );
}

export { NewsletterForm };
