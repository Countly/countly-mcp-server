import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleListJourneys,
  handleGetJourney,
  handleCreateJourney,
  handleUpdateJourney,
  handleDeleteJourney,
  handlePublishJourney,
  handlePauseJourney,
  handleResumeJourney,
  handleJourneyStatsSummary,
  handleJourneyStatsTable,
  handleJourneyStatsPerformance,
  handleJourneyStatsUids,
  handleJourneyBlockReference,
} from '../src/tools/journeys.js';
import { ToolContext } from '../src/tools/types.js';

describe('Journeys Tools', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      httpClient: {
        post: vi.fn(),
        get: vi.fn(),
      } as any,
      appCache: vi.fn() as any,
      getAuthParams: vi.fn().mockReturnValue({}),
      resolveAppId: vi.fn().mockResolvedValue('app123'),
      getApps: vi.fn(),
    };
  });

  const sampleJourney = {
    _id: 'journey1',
    name: 'Onboarding Journey',
    appId: 'app123',
    status: 'draft',
    versions: [
      {
        _id: 'version1',
        version: 1,
        status: 'draft',
        blocks: [{ id: 'block_1', blockType: 'trigger', subType: 'incoming-data' }],
        skip_threshold: null,
      },
    ],
  };

  describe('handleListJourneys', () => {
    it('should list journeys for an app', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: [sampleJourney] });

      const result = await handleListJourneys(mockContext, { app_id: 'app123' });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/journey-engine/list',
        { params: { app_id: 'app123' } }
      );
      expect(result.content[0].text).toContain('Onboarding Journey');
    });

    it('should include deleted journeys when requested', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { active: [], deleted: [] } });

      await handleListJourneys(mockContext, { app_id: 'app123', with_deleted: true });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/journey-engine/list',
        { params: { app_id: 'app123', withDeletedJourneys: 'true' } }
      );
    });
  });

  describe('handleGetJourney', () => {
    it('should get a journey by id', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleJourney });

      const result = await handleGetJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/journey-engine/journey',
        { params: { app_id: 'app123', id: 'journey1' } }
      );
      expect(result.content[0].text).toContain('Onboarding Journey');
    });
  });

  describe('handleCreateJourney', () => {
    it('should create a journey with a JSON body', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({ data: sampleJourney });

      const blocks = [{ id: 'block_1', blockType: 'trigger', subType: 'incoming-data' }];
      const result = await handleCreateJourney(mockContext, {
        app_id: 'app123',
        name: 'Onboarding Journey',
        blocks: JSON.stringify(blocks),
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/journey-engine/journeys/save',
        {
          app_id: 'app123',
          name: 'Onboarding Journey',
          version: { blocks },
        },
        { params: { app_id: 'app123' } }
      );
      expect(result.content[0].text).toContain('Onboarding Journey');
    });

    it('should include skip_threshold when provided', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({ data: sampleJourney });

      await handleCreateJourney(mockContext, {
        app_id: 'app123',
        name: 'Onboarding Journey',
        blocks: '[]',
        skip_threshold: 3,
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/journey-engine/journeys/save',
        expect.objectContaining({ skip_threshold: 3 }),
        { params: { app_id: 'app123' } }
      );
    });

    it('should reject invalid blocks JSON', async () => {
      const result = await handleCreateJourney(mockContext, {
        app_id: 'app123',
        name: 'Bad Journey',
        blocks: 'not-json',
      });

      expect(result.content[0].text).toContain('Invalid blocks JSON');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });

    it('should reject non-array blocks JSON', async () => {
      const result = await handleCreateJourney(mockContext, {
        app_id: 'app123',
        name: 'Bad Journey',
        blocks: '{"id":"block_1"}',
      });

      expect(result.content[0].text).toContain('blocks must be an array');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateJourney', () => {
    it('should preserve existing name and blocks when omitted', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleJourney });
      mockContext.httpClient.post = vi.fn().mockResolvedValue({ data: sampleJourney });

      await handleUpdateJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/journey-engine/journey',
        { params: { app_id: 'app123', id: 'journey1' } }
      );
      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/journey-engine/journeys/save',
        {
          _id: 'journey1',
          app_id: 'app123',
          name: 'Onboarding Journey',
          version: {
            _id: 'version1',
            blocks: sampleJourney.versions[0].blocks,
          },
        },
        { params: { app_id: 'app123' } }
      );
    });

    it('should apply new name and blocks when provided', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleJourney });
      mockContext.httpClient.post = vi.fn().mockResolvedValue({ data: sampleJourney });

      const newBlocks = [{ id: 'block_2', blockType: 'end', subType: 'journey-exit' }];
      await handleUpdateJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
        name: 'Renamed Journey',
        blocks: JSON.stringify(newBlocks),
        skip_threshold: 5,
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/journey-engine/journeys/save',
        {
          _id: 'journey1',
          app_id: 'app123',
          name: 'Renamed Journey',
          version: {
            _id: 'version1',
            blocks: newBlocks,
          },
          skip_threshold: 5,
        },
        { params: { app_id: 'app123' } }
      );
    });

    it('should ask for version_id when journey has multiple versions', async () => {
      const multiVersionJourney = {
        ...sampleJourney,
        versions: [
          { _id: 'version1', version: 1, status: 'active', blocks: [] },
          { _id: 'version2', version: 2, status: 'draft', blocks: [] },
        ],
      };
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: multiVersionJourney });

      const result = await handleUpdateJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
      });

      expect(result.content[0].text).toContain('Provide version_id explicitly');
      expect(result.content[0].text).toContain('version1');
      expect(result.content[0].text).toContain('version2');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });

    it('should error when the given version_id does not exist', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleJourney });

      const result = await handleUpdateJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
        version_id: 'missing-version',
      });

      expect(result.content[0].text).toContain('not found on this journey');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });

    it('should reject invalid blocks JSON', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleJourney });

      const result = await handleUpdateJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
        blocks: 'not-json',
      });

      expect(result.content[0].text).toContain('Invalid blocks JSON');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('handleDeleteJourney', () => {
    it('should delete a journey by id', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { _id: 'journey1', status: 'deleted' },
      });

      const result = await handleDeleteJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/journey-engine/delete',
        null,
        { params: { app_id: 'app123', id: 'journey1' } }
      );
      expect(result.content[0].text).toContain('deleted');
    });
  });

  describe('handlePublishJourney', () => {
    it('should publish with explicit version_id without fetching the journey', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { journeyDefinitionId: 'journey1', id: 'version1', status: 'active' },
      });

      await handlePublishJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
        version_id: 'version1',
      });

      expect(mockContext.httpClient.get).not.toHaveBeenCalled();
      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/journey-engine/journeys/publish',
        { journeyId: 'journey1', versionId: 'version1', status: 'active' },
        { params: { app_id: 'app123' } }
      );
    });

    it('should resolve the only version when version_id is omitted', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleJourney });
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { journeyDefinitionId: 'journey1', id: 'version1', status: 'active' },
      });

      await handlePublishJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/journey-engine/journeys/publish',
        { journeyId: 'journey1', versionId: 'version1', status: 'active' },
        { params: { app_id: 'app123' } }
      );
    });

    it('should support unpublishing via status draft', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { journeyDefinitionId: 'journey1', id: 'version1', status: 'draft' },
      });

      await handlePublishJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
        version_id: 'version1',
        status: 'draft',
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/journey-engine/journeys/publish',
        { journeyId: 'journey1', versionId: 'version1', status: 'draft' },
        { params: { app_id: 'app123' } }
      );
    });
  });

  describe('handlePauseJourney', () => {
    it('should resolve the active version when version_id is omitted', async () => {
      const journey = {
        ...sampleJourney,
        versions: [
          { _id: 'version1', version: 1, status: 'draft', blocks: [] },
          { _id: 'version2', version: 2, status: 'active', blocks: [] },
        ],
      };
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: journey });
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { journeyDefinitionId: 'journey1', id: 'version2', status: 'paused' },
      });

      await handlePauseJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/journey-engine/journeys/pause',
        { journeyId: 'journey1', versionId: 'version2' },
        { params: { app_id: 'app123' } }
      );
    });

    it('should error when no active version exists and version_id is omitted', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleJourney });

      const result = await handlePauseJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
      });

      expect(result.content[0].text).toContain('No version with status "active"');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('handleJourneyBlockReference', () => {
    it('should return static block schema documentation without any API call', async () => {
      const result = await handleJourneyBlockReference(mockContext, {});

      expect(mockContext.httpClient.get).not.toHaveBeenCalled();
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('blockType');
      expect(result.content[0].text).toContain('incoming-data');
      expect(result.content[0].text).toContain('updateStatement');
      expect(result.content[0].text).toContain('nextBlocks');
    });
  });

  describe('handleJourneyStatsSummary', () => {
    it('should request summary stats with optional version and period', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { usersEntered: 10 } });

      await handleJourneyStatsSummary(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
        version_id: 'version1',
        period: '30days',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/journey-engine/stats/summary',
        {
          params: {
            app_id: 'app123',
            journeyDefinitionId: 'journey1',
            journeyVersionId: 'version1',
            period: '30days',
          },
        }
      );
    });
  });

  describe('handleJourneyStatsTable', () => {
    it('should request the stats table with pagination defaults', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { aaData: [] } });

      await handleJourneyStatsTable(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/journey-engine/stats/table',
        {
          params: {
            app_id: 'app123',
            journeyDefinitionId: 'journey1',
            iDisplayStart: '0',
            iDisplayLength: '10',
            sEcho: '1',
          },
        }
      );
    });

    it('should pass task_id to fetch a long-running query result', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { aaData: [] } });

      await handleJourneyStatsTable(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
        task_id: 'task42',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/journey-engine/stats/table',
        expect.objectContaining({
          params: expect.objectContaining({ taskId: 'task42' }),
        })
      );
    });
  });

  describe('handleJourneyStatsPerformance', () => {
    it('should request performance time-series data', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: [] });

      await handleJourneyStatsPerformance(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
        period: '7days',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/journey-engine/stats/performance',
        {
          params: {
            app_id: 'app123',
            journeyDefinitionId: 'journey1',
            period: '7days',
          },
        }
      );
    });
  });

  describe('handleJourneyStatsUids', () => {
    it('should request user UIDs for a stat bucket', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { uids: ['u1'] } });

      await handleJourneyStatsUids(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
        uid_type: 'users_completed',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/journey-engine/stats/uids',
        {
          params: {
            app_id: 'app123',
            journeyDefinitionId: 'journey1',
            uidType: 'users_completed',
          },
        }
      );
    });
  });

  describe('handleResumeJourney', () => {
    it('should resolve the paused version when version_id is omitted', async () => {
      const journey = {
        ...sampleJourney,
        versions: [
          { _id: 'version1', version: 1, status: 'paused', blocks: [] },
        ],
      };
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: journey });
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { journeyDefinitionId: 'journey1', id: 'version1', status: 'active' },
      });

      await handleResumeJourney(mockContext, {
        app_id: 'app123',
        journey_id: 'journey1',
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/journey-engine/journeys/resume',
        { journeyId: 'journey1', versionId: 'version1' },
        { params: { app_id: 'app123' } }
      );
    });
  });
});
