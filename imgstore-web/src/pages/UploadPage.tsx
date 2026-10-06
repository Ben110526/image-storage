import React from 'react';
import { Box } from '@mui/material';
import { StorageTelemetryDeck } from '../components/StorageTelemetryDeck';
import { DropZone } from '../components/DropZone';
import { PageHeader } from '../components/ui/PageHeader';

/* Upload — plan §10.1, FIX-04: the primary action comes FIRST.
 * Order: H1 + short description → drop zone / file picker / URL import CTA
 * (which owns destination picking and the queue) → storage summary as a
 * secondary region at the bottom. No telemetry competing with the task. */

export const UploadPage: React.FC = () => {
  return (
    <Box>
      <PageHeader
        title="Upload"
        description="Tải file lên và nhận link chia sẻ."
      />

      <DropZone />

      {/* FIX-04 — storage summary is a secondary region, AFTER the task. */}
      <Box sx={{ mt: { xs: 3, md: 4 } }}>
        <StorageTelemetryDeck />
      </Box>
    </Box>
  );
};
