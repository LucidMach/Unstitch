import { describe, it, expect } from 'vitest';
import { ShareSchema } from '../../src/lib/schemas/share.js';

describe('ShareSchema validation', () => {
  const baseValidPayload = {
    email: 'creator@example.com',
    projectName: 'My Hex Origami',
    designData: {
      version: 1,
      timestamp: Date.now(),
      tiles: [
        { id: 'root', position: [0, 0, 0], rotation: [0, 0, 0], children: {}, foldAngle: 0 },
      ],
      worldTransform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
      overlap: 0.61,
    },
    previewImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    _gotcha: '',
  };

  it('validates a complete valid share payload', () => {
    const result = ShareSchema.safeParse(baseValidPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('creator@example.com');
      expect(result.data.projectName).toBe('My Hex Origami');
      expect(result.data.designData.tiles.length).toBe(1);
    }
  });

  it('defaults project name when omitted', () => {
    const { projectName, ...withoutName } = baseValidPayload;
    const result = ShareSchema.safeParse(withoutName);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projectName).toBe('Unstitch 3D Creation');
    }
  });

  it('rejects invalid email formats', () => {
    const invalidEmails = ['plainaddress', 'test@', '@domain.com', 'test@domain'];
    for (const email of invalidEmails) {
      const result = ShareSchema.safeParse({ ...baseValidPayload, email });
      expect(result.success).toBe(false);
    }
  });

  it('rejects payload missing designData or tiles array', () => {
    const result1 = ShareSchema.safeParse({ ...baseValidPayload, designData: {} });
    expect(result1.success).toBe(false);

    const result2 = ShareSchema.safeParse({ ...baseValidPayload, designData: null });
    expect(result2.success).toBe(false);
  });

  it('rejects invalid preview image format', () => {
    const result = ShareSchema.safeParse({ ...baseValidPayload, previewImage: 'https://example.com/image.jpg' });
    expect(result.success).toBe(false);
  });
});
