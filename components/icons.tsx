import React from 'react';

export const MicrophoneIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM11 5a1 1 0 0 1 2 0v6a1 1 0 0 1-2 0V5Z"></path>
    <path d="M12 18.5a5.5 5.5 0 0 1-5.5-5.5V12h1v1a4.5 4.5 0 0 0 9 0v-1h1v1a5.5 5.5 0 0 1-5.5 5.5Z"></path>
  </svg>
);

export const StopIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8 8h8v8H8z" />
  </svg>
);

export const PauseIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
);

export const VolumeUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M18.273 4.05a1 1 0 0 1 .237 1.39l-1.01 1.635a8.955 8.955 0 0 1 2.45 6.925 8.955 8.955 0 0 1-2.45 6.925l1.01 1.635a1 1 0 0 1-1.627 1.005l-1.01-1.635A8.91 8.91 0 0 1 15 21a1 1 0 1 1 0-2 6.953 6.953 0 0 0 1.9-4.925A6.953 6.953 0 0 0 15 9a1 1 0 1 1 0-2 8.91 8.91 0 0 1 3.273-.655l1.01-1.635a1 1 0 0 1 1.39-.237.995.995 0 0 1-.36.57ZM11 4a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1Zm-1 2.378A2.992 2.992 0 0 1 12.995 6H14a1 1 0 1 1 0 2h-1.005A2.992 2.992 0 0 1 10 10.378V12a1 1 0 1 1-2 0v-1.622A2.992 2.992 0 0 1 5.005 8H4a1 1 0 1 1 0-2h1.005A2.992 2.992 0 0 1 8 3.622V2a1 1 0 1 1 2 0v4.378Zm-1 8.167A2.992 2.992 0 0 1 5.005 16H4a1 1 0 1 1 0 2h1.005A2.992 2.992 0 0 1 8 20.378V22a1 1 0 1 1 2 0v-1.622a2.992 2.992 0 0 1 2.995-2.756H14a1 1 0 1 1 0-2h-1.005A2.992 2.992 0 0 1 10 13.622v-1.545a.997.997 0 0 1-1.995-.093l-.005 1.561Z" />
  </svg>
);

export const SendIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
  </svg>
);

export const BotIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.647c1.295.742 1.295 2.545 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
    </svg>
);