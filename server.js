<?phpconst express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/verify-task', (req, res) => {
    // Verification logic here
    res.status(200).json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// 1. ڈیٹا بیس کنکشن فائل انکلوڈ کریں
require_once 'config.php';

// سیشن شروع کریں (اگر پہلے سے شروع نہ ہو)
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$message = "";
$status_class = "";

// فرض کریں کہ یوزر آئی ڈی سیشن میں موجود ہے
$user_id = $_SESSION['user_id'] ?? 1; // ٹیسٹنگ کے لیے 1 رکھا ہے

// 2. جب ورکر "ویریفائی کریں" بٹن پر کلک کرے
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'verify_task') {
    $task_id = intval($_POST['task_id']);
    $worker_tiktok = trim($_POST['worker_tiktok']);

    // یوزر نیم سے '@' ہٹائیں اگر یوزر نے لکھی ہو
    $worker_tiktok = ltrim($worker_tiktok, '@');

    if (empty($worker_tiktok)) {
        $message = "براہِ کرم اپنا ٹک ٹاک یوزر نیم درج کریں!";
        $status_class = "danger";
    } else {
        // ڈیٹا بیس سے ٹاسک کی تفصیلات (ٹارگٹ اکاؤنٹ اور ریوارڈ) حاصل کریں
        $stmt = $conn->prepare("SELECT target_account, reward_amount, status FROM tasks WHERE id = ?");
        $stmt->bind_param("i", $task_id);
        $stmt->execute();
        $task = $stmt->get_result()->fetch_assoc();

        if (!$task) {
            $message = "ٹاسک نہیں ملا!";
            $status_class = "danger";
        } else {
            $targetAccount = ltrim($task['target_account'], '@');
            $reward = floatval($task['reward_amount']);

            // 3. Render پر ہوسٹ شدہ Node.js API کا URL
            // نوٹ: یہاں اپنی Render کا اصل URL لگائیں!
            $apiUrl = "https://your-render-app-name.onrender.com/verify-follow";

            $postData = json_encode([
                'username' => $worker_tiktok,
                'targetAccount' => $targetAccount
            ]);

            // cURL کے ذریعے Render API کو ڈیٹا بھیجنا
            $ch = curl_init($apiUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30); // 30 سیکنڈ ٹائم آؤٹ

            $response = curl_exec($ch);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($curlError) {
                $message = "سرور سے رابطہ کرنے میں مسئلہ آیا: " . $curlError;
                $status_class = "danger";
            } else {
                $result = json_decode($response, true);

                if (isset($result['followed']) && $result['followed'] === true) {
                    // ڈیٹا بیس میں ورکر کا بیلنس بڑھائیں
                    $conn->begin_transaction();

                    try {
                        // ورکر کے اکاؤنٹ میں پیسے / پوائنٹس شامل کریں
                        $updateUser = $conn->prepare("UPDATE users SET balance = balance + ? WHERE id = ?");
                        $updateUser->bind_param("di", $reward, $user_id);
                        $updateUser->execute();

                        // ٹاسک کی ہسٹری محفوظ کریں
                        $logTask = $conn->prepare("INSERT INTO user_tasks (user_id, task_id, status, reward) VALUES (?, ?, 'completed', ?)");
                        $logTask->bind_param("iid", $user_id, $task_id, $reward);
                        $logTask->execute();

                        $conn->commit();

                        $message = "مبارک ہو! تصدیق کامیاب ہو گئی ہے۔ PKR " . number_format($reward, 2) . " آپ کے والٹ میں شامل کر دیے گئے ہیں۔";
                        $status_class = "success";
                    } catch (Exception $e) {
                        $conn->rollback();
                        $message = "ڈیٹا بیس کی غلطی: " . $e->getMessage();
                        $status_class = "danger";
                    }
                } else {
                    $message = "تصدیق ناکام! ایسا لگتا ہے کہ آپ نے ابھی تک اس اکاؤنٹ (@{$targetAccount}) کو فالو نہیں کیا۔";
                    $status_class = "warning";
                }
            }
        }
    }
}

// 4. ایکٹیو ٹاسکس ڈیٹا بیس سے حاصل کریں
$tasksResult = $conn->query("SELECT * FROM tasks WHERE status = 'active' ORDER BY id DESC");
?>

<!DOCTYPE html>
<html lang="ur" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ٹک ٹاک آٹو ٹاسکس - ویریفیکیشن</title>
    <!-- Bootstrap 5 CSS (RTL Version) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.rtl.min.css">
    <!-- FontAwesome Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- Google Font (Noto Nastaliq Urdu / Cairo) -->
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">

    <style>
        body {
            font-family: 'Cairo', sans-serif;
            background-color: #f4f6f9;
        }
        .task-card {
            border: none;
            border-radius: 15px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            background: #ffffff;
        }
        .task-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }
        .tiktok-badge {
            background: linear-gradient(45deg, #00f2fe, #4facfe);
            color: #fff;
            padding: 5px 12px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.85rem;
        }
        .reward-badge {
            background-color: #28a745;
            color: white;
            font-size: 1.1rem;
            font-weight: bold;
            padding: 6px 15px;
            border-radius: 10px;
        }
        .btn-tiktok {
            background: #000000;
            color: #ffffff;
            border-radius: 10px;
            font-weight: 600;
        }
        .btn-tiktok:hover {
            background: #222222;
            color: #fe2c55;
        }
        .btn-verify {
            background: linear-gradient(45deg, #fe2c55, #25f4ee);
            color: #ffffff;
            font-weight: bold;
            border: none;
            border-radius: 10px;
        }
        .btn-verify:hover {
            opacity: 0.9;
            color: #fff;
        }
    </style>
</head>
<body>

<div class="container py-5">
    <div class="row justify-content-center mb-4">
        <div class="col-md-8 text-center">
            <h2 class="fw-bold mb-2"><i class="fa-brands fa-tiktok text-danger me-2"></i> ٹک ٹاک فالو ٹاسکس</h2>
            <p class="text-muted">نیچے دیے گئے ٹک ٹاک اکاؤنٹس کو فالو کریں اور "ویریفائی کریں" پر کلک کر کے فوری رقم حاصل کریں۔</p>
        </div>
    </div>

    <!-- الرٹ میسج -->
    <?php if (!empty($message)): ?>
        <div class="row justify-content-center">
            <div class="col-md-8">
                <div class="alert alert-<?= $status_class ?> alert-dismissible fade show shadow-sm text-center" role="alert">
                    <i class="fa-solid fa-circle-info me-2"></i> <?= htmlspecialchars($message) ?>
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            </div>
        </div>
    <?php endif; ?>

    <!-- ٹاسکس کی لسٹ -->
    <div class="row justify-content-center g-4">
        <?php if ($tasksResult && $tasksResult->num_rows > 0): ?>
            <?php while ($row = $tasksResult->fetch_assoc()): ?>
                <div class="col-md-8">
                    <div class="card task-card p-4">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <div>
                                <span class="tiktok-badge me-2"><i class="fa-brands fa-tiktok"></i> TikTok Follow</span>
                                <span class="text-muted small">ٹاسک #<?= $row['id'] ?></span>
                            </div>
                            <span class="reward-badge">PKR <?= number_format($row['reward_amount'], 2) ?></span>
                        </div>

                        <h5 class="fw-bold text-dark mb-3">
                            اکاؤنٹ فالو کریں: <span class="text-primary">@<?= htmlspecialchars($row['target_account']) ?></span>
                        </h5>

                        <div class="d-grid gap-2 d-md-flex justify-content-md-between align-items-center mt-3">
                            <!-- 1. ٹک ٹاک کھول کر فالو کرنے کا بٹن -->
                            <a href="https://www.tiktok.com/@<?= urlencode($row['target_account']) ?>" target="_blank" class="btn btn-tiktok btn-lg px-4 mb-2 mb-md-0">
                                <i class="fa-brands fa-tiktok me-2"></i> فالو کرنے کے لیے لنک کھولیں
                            </a>

                            <!-- 2. اٹومیٹک ویریفائی کرنے کا فارم -->
                            <form method="POST" class="d-flex align-items-center gap-2 w-100 w-md-auto">
                                <input type="hidden" name="action" value="verify_task">
                                <input type="hidden" name="task_id" value="<?= $row['id'] ?>">
                                
                                <input type="text" name="worker_tiktok" class="form-control" placeholder="آپ کا TikTok یوزرنیم" required style="max-width: 200px;">
                                <button type="submit" class="btn btn-verify btn-lg px-4 text-nowrap">
                                    <i class="fa-solid fa-circle-check me-1"></i> ویریفائی کریں
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            <?php endwhile; ?>
        <?php else: ?>
            <div class="col-md-8 text-center py-5">
                <i class="fa-solid fa-list-check fa-3x text-muted mb-3"></i>
                <h4 class="text-muted">فی الحال کوئی نیا ٹاسک دستیاب نہیں ہے!</h4>
            </div>
        <?php endif; ?>
    </div>
</div>

<!-- Bootstrap 5 JS -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
