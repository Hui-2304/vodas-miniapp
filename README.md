# VODAS Telegram Mini App

Giao diện Mini App tĩnh. Không chứa bot token, PIN hoặc khóa thiết bị.

## Bật trang web

Trong repository GitHub: **Settings → Pages → Deploy from a branch → main → /(root) → Save**.

GitHub Pages sẽ hiển thị URL sau khi triển khai xong. Thêm `/control.html` vào URL đó để điền tại Portal VODAS → Device → Telegram Mini App → trang điều khiển.

Sau khi Save trên Portal, dùng tài khoản trong danh bạ gửi `/app` trong chat riêng với bot và bấm **Open VODAS controls**. Cả STM32 và ESP32 cần firmware hỗ trợ Mini App; xuất bản web không cập nhật firmware.

## Các trang

- `control.html`: điều khiển thật, cần snapshot từ nút Telegram sau lệnh `/app`.
- `control.html?demo=normal`: xem thử giao diện, không gửi lệnh.
- `control.html?demo=alert`: xem thử cảnh báo.
- `history.html`: lịch sử, hiện chưa cấu hình API. Giữ History tắt trên Portal.
- `design.html`: bản thiết kế mẫu.

GitHub Pages không áp dụng file `_headers` của các hosting khác. Các trang điều khiển/lịch sử dùng CSP trong HTML và Referrer-Policy no-referrer; không có analytics hoặc lưu snapshot trong localStorage. Cache-Control no-store và việc tắt log query phía hosting không thể cấu hình qua gói Pages này. Snapshot nằm trong URL khi mở từ Telegram, được xóa khỏi thanh địa chỉ sau khi đọc; không chứa thông tin đăng nhập.

Chỉ tải giao diện web lên repository này. Không tải firmware, ảnh cabin, file sao lưu hoặc thông tin đăng nhập.
