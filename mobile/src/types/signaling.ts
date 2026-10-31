export type Signal = {
  type: 'offer' | 'answer' | 'ice' | 'joined' | 'error' | 'orientation';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  message?: string;
  orientation?: 'portrait' | 'landscape';
};
