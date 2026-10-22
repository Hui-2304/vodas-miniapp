# VODAS Telegram Mini App

Giao diện Mini App tĩnh. Không chứa bot token, PIN hoặc khóa thiết bị.

- Điều khiển: https://hui-2304.github.io/vodas-miniapp/control.html
- Xem thử: https://hui-2304.github.io/vodas-miniapp/control.html?demo=normal

## Chức năng xe

| Mục | Chức năng |
| --- | --- |
| Tổng quan | Trạng thái xe, AUTO/ON, nhận cảnh báo, yêu cầu ảnh/AI, vị trí, điện áp, radar, ánh sáng, mạng di động và đăng ký làm tài xế |
| Thiết bị | Chủ xe chỉnh hệ thống 12/24 V, lưu đồng thời ba ngưỡng điện, hiệu chỉnh điện áp, mã xe và bật/tắt âm thanh |
| Kiểm tra tại xe | Chủ xe thử LED, còi trong 3 giây, quét radar 10 giây; chỉ khi xe ở trạng thái chờ phù hợp |
| Danh bạ | Xem danh bạ trong chat riêng; chủ xe thêm/sửa tên, điện thoại, Telegram ID; xóa liên hệ 2–5; chọn tài xế đã lưu |

Mỗi thao tác đóng Mini App; kết quả trả trong cuộc trò chuyện. Gửi `/app` để lấy phiên mới và xem cấu hình đã lưu. Thay đổi trạng thái có bước xác nhận, bị khóa khi bản chụp cũ hoặc không đúng quyền. Firmware kiểm tra lại quyền và cấu hình hiện hành trước khi thực thi.

Danh bạ không nằm trong URL. Chọn **Danh bạ → Xem danh bạ trong chat** để lấy danh sách hiện tại. Khi sửa, Telegram ID để trống giữ ID hiện có; số điện thoại để trống xóa số cũ. Không chuyển chủ xe hoặc di chuyển một Telegram ID đã thuộc liên hệ khác qua giao diện này.

Cần firmware STM32 và ESP32 hỗ trợ phần mở rộng chức năng xe. Firmware cũ vẫn hiển thị thông tin cơ bản và khóa phần mở rộng. Chưa bổ sung Wi-Fi, bot token, Cloud hoặc đổi PIN. History chưa có API triển khai: giữ công tắc History tắt trên Portal.

## Phát triển và kiểm tra

HTML/CSS/ES modules tại gốc là mã nguồn web, không cần bundler. Ba trang `index.html`, `control.html`, `history.html` dùng cùng bố cục. Tăng phiên bản query của assets khi xuất bản để WebView không dùng mã cache cũ.

```text
python -m http.server 8766 --bind 127.0.0.1
node --test tests/core.test.mjs
node tests/browser.test.mjs http://127.0.0.1:8766
```

Kiểm tra trình duyệt dùng Node 24 và Microsoft Edge trên Windows; giả lập Telegram, không gửi lệnh thật. Kiểm tra 320/390 px, sáng/tối, tab, biểu mẫu, xác nhận/hủy, quyền, UTF-8, phiên cũ, demo và một lần gửi mỗi trang. Ảnh nằm trong `.cache/exports/miniapp-previews/` tương đối với thư mục chạy lệnh.

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
