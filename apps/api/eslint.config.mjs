import { nestConfig } from '@forge/eslint-config/nest';

// Type-aware rules need this app as their tsconfig root.
export default nestConfig(import.meta.dirname);
