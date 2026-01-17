import { describe, test, expect } from 'bun:test';
import { createRequest, getHostFromUrl, serializeRequest, deserializeRequest } from '../../src/core/request';
import type { QueueRequestInput } from '../../src/types';

describe('Request Utilities', () => {
  describe('createRequest', () => {
    test('creates request with generated ID', () => {
      const input: QueueRequestInput = {
        url: 'https://api.example.com/data',
        method: 'GET',
      };

      const request = createRequest(input);

      expect(request.id).toBeDefined();
      expect(request.id).toHaveLength(36); // UUID format
      expect(request.url).toBe(input.url);
      expect(request.method).toBe(input.method);
      expect(request.createdAt).toBeInstanceOf(Date);
    });

    test('uses provided ID', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const input: QueueRequestInput = {
        id,
        url: 'https://api.example.com/data',
        method: 'POST',
      };

      const request = createRequest(input);

      expect(request.id).toBe(id);
    });

    test('sets default priority', () => {
      const input: QueueRequestInput = {
        url: 'https://api.example.com/data',
        method: 'GET',
      };

      const request = createRequest(input);

      expect(request.priority).toBe(50);
    });

    test('uses provided priority', () => {
      const input: QueueRequestInput = {
        url: 'https://api.example.com/data',
        method: 'GET',
        priority: 90,
      };

      const request = createRequest(input);

      expect(request.priority).toBe(90);
    });

    test('validates URL format', () => {
      const input: QueueRequestInput = {
        url: 'not-a-valid-url',
        method: 'GET',
      };

      expect(() => createRequest(input)).toThrow();
    });

    test('validates HTTP method', () => {
      const input = {
        url: 'https://api.example.com/data',
        method: 'INVALID',
      };

      expect(() => createRequest(input as QueueRequestInput)).toThrow();
    });

    test('includes optional fields', () => {
      const input: QueueRequestInput = {
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: 'value' },
        maxRetries: 5,
        timeout: 10000,
      };

      const request = createRequest(input);

      expect(request.headers).toEqual(input.headers);
      expect(request.body).toEqual(input.body);
      expect(request.maxRetries).toBe(5);
      expect(request.timeout).toBe(10000);
    });
  });

  describe('getHostFromUrl', () => {
    test('extracts host from URL', () => {
      expect(getHostFromUrl('https://api.example.com/data')).toBe('api.example.com');
      expect(getHostFromUrl('http://localhost:3000/api')).toBe('localhost:3000');
      expect(getHostFromUrl('https://sub.domain.com:8080/path')).toBe('sub.domain.com:8080');
    });

    test('returns unknown for invalid URLs', () => {
      expect(getHostFromUrl('not-a-url')).toBe('unknown');
      expect(getHostFromUrl('')).toBe('unknown');
    });
  });

  describe('serializeRequest / deserializeRequest', () => {
    test('roundtrip serialization preserves data', () => {
      const input: QueueRequestInput = {
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
        body: { data: [1, 2, 3] },
        priority: 75,
      };

      const request = createRequest(input);
      const serialized = serializeRequest(request);
      const deserialized = deserializeRequest(serialized);

      expect(deserialized.id).toBe(request.id);
      expect(deserialized.url).toBe(request.url);
      expect(deserialized.method).toBe(request.method);
      expect(deserialized.headers).toEqual(request.headers);
      expect(deserialized.body).toEqual(request.body);
      expect(deserialized.priority).toBe(request.priority);
      expect(deserialized.createdAt).toEqual(request.createdAt);
    });

    test('handles scheduled requests', () => {
      const scheduledFor = new Date(Date.now() + 60000);
      const input: QueueRequestInput = {
        url: 'https://api.example.com/data',
        method: 'GET',
        scheduledFor,
      };

      const request = createRequest(input);
      const serialized = serializeRequest(request);
      const deserialized = deserializeRequest(serialized);

      expect(deserialized.scheduledFor).toEqual(scheduledFor);
    });
  });
});
