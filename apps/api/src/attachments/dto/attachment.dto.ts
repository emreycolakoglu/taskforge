import { IsIn } from 'class-validator';

export const SUBJECT_TYPE_VALUES = ['task', 'comment', 'document'] as const;

export class SubjectTypeDto {
  @IsIn(SUBJECT_TYPE_VALUES)
  subjectType: string;
}
