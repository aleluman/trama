import { useSyncExternalStore } from "react";
import { serverLog } from "./api";

// Requests that reached the simulated server. The TanStack Query cache shares responses by
// scope, endpoint, and parameters, regardless of row. Two identical lines make one request.
export const Server = () => {
  const requests = useSyncExternalStore(serverLog.subscribe, serverLog.getSnapshot);
  return (
    <div className="state-panel" aria-label="Server requests">
      <strong>Server requests</strong>
      <ol>
        {requests.map((request) => (
          <li key={request.id}>{request.text}</li>
        ))}
      </ol>
    </div>
  );
};
