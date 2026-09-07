import type { ComponentType } from 'react';

export interface Module {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultEnabled: boolean;
  route: string;
  component: ComponentType;
}
