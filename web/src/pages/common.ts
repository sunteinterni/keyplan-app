import type { Dispatch, SetStateAction } from 'react';
import type { Bundle } from '../../../shared/types';

export interface TabProps {
  bundle: Bundle;
  setBundle: Dispatch<SetStateAction<Bundle | null>>;
  reload: () => Promise<void>;
  toast: (m: string) => void;
}
