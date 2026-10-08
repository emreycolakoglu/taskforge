import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProjectDto } from './update-project.dto';

// The web edit dialog clears a field by sending explicit null, so null must
// survive validation for every clearable field.
describe('UpdateProjectDto', () => {
  it('accepts null for startDate, targetDate, leadId and description', async () => {
    const dto = plainToInstance(UpdateProjectDto, {
      startDate: null,
      targetDate: null,
      leadId: null,
      description: null,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('still rejects a malformed date string', async () => {
    const dto = plainToInstance(UpdateProjectDto, { startDate: 'not-a-date' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('startDate');
  });

  it('still rejects an unknown status', async () => {
    const dto = plainToInstance(UpdateProjectDto, { status: 'archived' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('status');
  });
});
