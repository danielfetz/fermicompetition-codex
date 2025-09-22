"use client";

export default function LoadingState({ message }: { message?: string }) {
  return (
    <div className="loading-state">
      <div className="loading-state__spinner" aria-hidden="true" />
      <p>{message ?? "Loading"}</p>
    </div>
  );
}
