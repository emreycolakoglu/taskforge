import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateSettingsDto } from './update-settings.dto';

describe('UpdateSettingsDto', () => {
  it('rejects maxFileSizeMb above the static upload cap (100)', async () => {
    const dto = plainToInstance(UpdateSettingsDto, { maxFileSizeMb: 200 });
    const errors = await validate(dto);
    const maxError = errors.find((e) => e.property === 'maxFileSizeMb');
    expect(maxError).toBeDefined();
    expect(maxError!.constraints).toHaveProperty('max');
  });

  it('accepts maxFileSizeMb within the cap', async () => {
    const dto = plainToInstance(UpdateSettingsDto, { maxFileSizeMb: 100 });
    const errors = await validate(dto);
    const maxError = errors.find((e) => e.property === 'maxFileSizeMb');
    expect(maxError).toBeUndefined();
  });
});
