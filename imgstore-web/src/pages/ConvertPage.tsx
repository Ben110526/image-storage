import React from 'react';
import { Box } from '@mui/material';
import { PageHeader } from '../components/ui/PageHeader';
import { DataState } from '../components/ui/DataState';
import { QuickDropZone } from '../components/QuickDropZone';
import { useConversionCapabilities } from '../hooks/useImages';
import { convertFileQuick, type QuickConvertRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';

/* Convert — quick, throwaway conversion (plan §3). The file goes up in the
 * request body and the converted bytes come back down; nothing lands in the
 * library and no quota is charged. Because there is no library record to fall
 * back on, the result card IS the only handle on the output — it keeps the blob
 * for a re-download until the user drops another file. */

export const ConvertPage: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading, showApiKeyDialog } = useAuth();
  const { data: capabilities, isLoading: capsLoading, isError: capsError, refetch } = useConversionCapabilities();

  const handleConvert = async (request: QuickConvertRequest) => convertFileQuick(request);

  const renderBody = () => {
    // Auth restore is its own state (FIX-05): neither needs-auth nor a spinner
    // for the capability list would be honest while the session is verified.
    if (authLoading) {
      return <DataState kind="loading" title="Đang kiểm tra kết nối…" compact />;
    }
    if (!isAuthenticated) {
      return (
        <DataState
          kind="needs-auth"
          title="Kết nối để chuyển đổi file"
          description="Chuyển đổi nhanh dùng API key của bạn. Tệp chỉ đi qua máy chủ để chuyển định dạng rồi trả về, không được lưu lại."
          action={{ label: 'Kết nối API key', onClick: showApiKeyDialog }}
        />
      );
    }
    if (capsLoading) {
      return <DataState kind="loading" title="Đang tải danh sách định dạng…" compact />;
    }
    if (capsError || !capabilities) {
      return (
        <DataState
          kind="error"
          title="Không tải được danh sách định dạng"
          description="Máy chủ chưa phản hồi danh sách định dạng có thể chuyển đổi. Kiểm tra kết nối rồi thử lại."
          action={{ label: 'Thử lại', onClick: () => { void refetch(); } }}
        />
      );
    }
    return <QuickDropZone capabilities={capabilities} onConvert={handleConvert} />;
  };

  return (
    <Box>
      <PageHeader
        title="Convert"
        description="Kéo thả file để chuyển đổi và tải về ngay — không lưu vào thư viện, không tính dung lượng."
      />
      {renderBody()}
    </Box>
  );
};
