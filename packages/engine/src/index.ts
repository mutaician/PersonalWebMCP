export type WorkflowNodeType =
  | 'NATIVE_TOOL'
  | 'DOM_INPUT'
  | 'DOM_SELECT'
  | 'DOM_ACTIVATE'
  | 'NAVIGATE'
  | 'WAIT_FOR'
  | 'EXTRACT'
  | 'ASSERT'
  | 'BRANCH'
  | 'PERSONAL_TOOL'
  | 'HUMAN_CONFIRMATION';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
}
