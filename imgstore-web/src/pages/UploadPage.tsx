import React from 'react';
import { Box } from '@mui/material';
import { StorageTelemetryDeck } from '../components/StorageTelemetryDeck';
import { DropZone } from '../components/DropZone';
import { PageHeader } from '../components/ui/PageHeader';

/* Upload — plan §10.1: the primary action comes FIRST.
 * Order: H1 + short description → storage summary row → drop zone (which
 * owns destination picking and the queue). No terminal hero, no feature
 * chips, no large telemetry deck competing with the task. */

export const UploadPage: React.FC = () => {
  return (
    <Box>
      <PageHeader
        title="Upload"
        description="Tải file lên và nhận link chia sẻ."
      />

      <Box sx={{ mb: { xs: 2.5, md: 3 } }}>
        <StorageTelemetryDeck />
      </Box>

      <DropZone />
    </Box>
  );
};
