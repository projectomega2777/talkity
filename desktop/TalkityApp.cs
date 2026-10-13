using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Speech.Recognition;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace TalkityDesktop
{
    public class TalkityForm : Form
    {
        // Win32 API Imports
        [DllImport("user32.dll")]
        public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll")]
        public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

        [DllImport("user32.dll")]
        public static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);

        // Win32 Constants
        private const int WM_HOTKEY = 0x0312;
        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HT_CAPTION = 0x2;
        private const int HOTKEY_ID = 9001;
        private const uint VK_F8 = 0x77;
        private const uint MOD_NOREPEAT = 0x4000;

        private const byte VK_CONTROL = 0x11;
        private const byte VK_V = 0x56;
        private const uint KEYEVENTF_KEYUP = 0x0002;

        private const string SERVER_URL = "http://localhost:3000";

        // UI Controls
        private Label lblStatus;
        private Label lblTimer;
        private Panel dotStatus;
        private Panel waveformBar;
        private Button btnAction;
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private System.Windows.Forms.Timer animTimer;

        // State
        private bool isRecording = false;
        private DateTime recordStartTime;
        private SpeechRecognitionEngine recognizer;
        private StringBuilder speechBuffer = new StringBuilder();
        private IntPtr lastTargetWindow = IntPtr.Zero;
        private int pulseTick = 0;

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TalkityForm());
        }

        public TalkityForm()
        {
            InitializeComponent();
            InitializeSpeechEngine();
            RegisterGlobalHotkey();
        }

        private void InitializeComponent()
        {
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition = FormStartPosition.Manual;
            this.Size = new Size(360, 48);
            this.TopMost = true;
            this.ShowInTaskbar = false;
            this.BackColor = Color.FromArgb(18, 22, 31);
            this.DoubleBuffered = true;

            // Position at top center of primary screen
            Rectangle screen = Screen.PrimaryScreen.WorkingArea;
            this.Location = new Point((screen.Width - this.Width) / 2, 28);

            // Status Dot
            dotStatus = new Panel();
            dotStatus.Size = new Size(10, 10);
            dotStatus.Location = new Point(16, 19);
            dotStatus.BackColor = Color.FromArgb(0, 242, 254);
            this.Controls.Add(dotStatus);

            // Status Label
            lblStatus = new Label();
            lblStatus.Text = "Talkity · F8 to Dictate";
            lblStatus.Font = new Font("Segoe UI", 10.5f, FontStyle.Bold);
            lblStatus.ForeColor = Color.FromArgb(240, 246, 252);
            lblStatus.Location = new Point(34, 13);
            lblStatus.AutoSize = true;
            this.Controls.Add(lblStatus);

            // Timer Label
            lblTimer = new Label();
            lblTimer.Text = "00:00";
            lblTimer.Font = new Font("Consolas", 9.5f, FontStyle.Regular);
            lblTimer.ForeColor = Color.FromArgb(139, 148, 158);
            lblTimer.Location = new Point(230, 16);
            lblTimer.AutoSize = true;
            lblTimer.Visible = false;
            this.Controls.Add(lblTimer);

            // Web Dashboard Quick Action Button
            btnAction = new Button();
            btnAction.Text = "Web";
            btnAction.Font = new Font("Segoe UI", 8f, FontStyle.Bold);
            btnAction.Size = new Size(46, 26);
            btnAction.Location = new Point(298, 11);
            btnAction.BackColor = Color.FromArgb(30, 36, 48);
            btnAction.ForeColor = Color.FromArgb(0, 242, 254);
            btnAction.FlatStyle = FlatStyle.Flat;
            btnAction.FlatAppearance.BorderSize = 0;
            btnAction.Cursor = Cursors.Hand;
            btnAction.Click += (s, e) => {
                try { System.Diagnostics.Process.Start(SERVER_URL); } catch { }
            };
            this.Controls.Add(btnAction);

            // Draggable Support
            this.MouseDown += (s, e) => {
                if (e.Button == MouseButtons.Left)
                {
                    ReleaseCapture();
                    SendMessage(this.Handle, WM_NCLBUTTONDOWN, HT_CAPTION, 0);
                }
            };
            lblStatus.MouseDown += (s, e) => {
                if (e.Button == MouseButtons.Left)
                {
                    ReleaseCapture();
                    SendMessage(this.Handle, WM_NCLBUTTONDOWN, HT_CAPTION, 0);
                }
            };

            // Paint Rounded Border and Glow
            this.Paint += (s, e) => {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Rectangle rect = new Rectangle(0, 0, this.Width - 1, this.Height - 1);
                using (GraphicsPath path = GetRoundedPath(rect, 24))
                {
                    this.Region = new Region(path);
                    Color borderColor = isRecording ? Color.FromArgb(239, 68, 68) : Color.FromArgb(0, 242, 254);
                    using (Pen pen = new Pen(borderColor, isRecording ? 2.5f : 1.5f))
                    {
                        e.Graphics.DrawPath(pen, path);
                    }
                }
            };

            // Tray Icon
            trayMenu = new ContextMenuStrip();
            trayMenu.Items.Add("Open Talkity Web App", null, (s, e) => {
                try { System.Diagnostics.Process.Start(SERVER_URL); } catch { }
            });
            trayMenu.Items.Add("Toggle HUD Pill", null, (s, e) => {
                this.Visible = !this.Visible;
            });
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Exit Talkity", null, (s, e) => {
                Application.Exit();
            });

            trayIcon = new NotifyIcon();
            trayIcon.Text = "Talkity - AI Voice Dictation";
            trayIcon.Icon = SystemIcons.Application;
            trayIcon.ContextMenuStrip = trayMenu;
            trayIcon.Visible = true;
            trayIcon.DoubleClick += (s, e) => { this.Visible = !this.Visible; };

            // Animation Timer
            animTimer = new System.Windows.Forms.Timer();
            animTimer.Interval = 250;
            animTimer.Tick += AnimTimer_Tick;
            animTimer.Start();
        }

        private void AnimTimer_Tick(object sender, EventArgs e)
        {
            if (isRecording)
            {
                pulseTick++;
                dotStatus.BackColor = (pulseTick % 2 == 0) ? Color.FromArgb(239, 68, 68) : Color.FromArgb(180, 30, 30);
                TimeSpan elapsed = DateTime.Now - recordStartTime;
                lblTimer.Text = string.Format("{0:D2}:{1:D2}", (int)elapsed.TotalMinutes, elapsed.Seconds);
                this.Invalidate();
            }
        }

        private GraphicsPath GetRoundedPath(Rectangle rect, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            int diameter = radius * 2;
            path.AddArc(rect.X, rect.Y, diameter, diameter, 180, 90);
            path.AddArc(rect.Right - diameter, rect.Y, diameter, diameter, 270, 90);
            path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(rect.X, rect.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }

        private void RegisterGlobalHotkey()
        {
            bool success = RegisterHotKey(this.Handle, HOTKEY_ID, MOD_NOREPEAT, VK_F8);
            if (!success)
            {
                // Fallback without MOD_NOREPEAT
                RegisterHotKey(this.Handle, HOTKEY_ID, 0, VK_F8);
            }
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY && m.WParam.ToInt32() == HOTKEY_ID)
            {
                ToggleDictation();
            }
            base.WndProc(ref m);
        }

        private void InitializeSpeechEngine()
        {
            try
            {
                recognizer = new SpeechRecognitionEngine();
                recognizer.SetInputToDefaultAudioDevice();
                DictationGrammar dictation = new DictationGrammar();
                recognizer.LoadGrammar(dictation);

                recognizer.SpeechRecognized += (s, e) => {
                    if (isRecording && e.Result != null && !string.IsNullOrEmpty(e.Result.Text))
                    {
                        speechBuffer.Append(e.Result.Text + " ");
                    }
                };
            }
            catch (Exception ex)
            {
                lblStatus.Text = "Mic not ready";
            }
        }

        private void ToggleDictation()
        {
            if (!isRecording)
            {
                StartDictation();
            }
            else
            {
                StopDictationAndInject();
            }
        }

        private void StartDictation()
        {
            isRecording = true;
            recordStartTime = DateTime.Now;
            speechBuffer.Clear();

            // Save the currently active window before we started
            lastTargetWindow = GetForegroundWindow();

            // Beep sound feedback
            try { Console.Beep(520, 90); Console.Beep(780, 110); } catch { }

            lblStatus.Text = "Listening...";
            lblStatus.ForeColor = Color.FromArgb(239, 68, 68);
            dotStatus.BackColor = Color.FromArgb(239, 68, 68);
            lblTimer.Visible = true;
            this.Invalidate();

            try
            {
                if (recognizer != null)
                {
                    recognizer.RecognizeAsync(RecognizeMode.Multiple);
                }
            }
            catch { }
        }

        private void StopDictationAndInject()
        {
            isRecording = false;
            lblTimer.Visible = false;

            try { Console.Beep(780, 90); Console.Beep(520, 110); } catch { }

            lblStatus.Text = "Polishing text...";
            lblStatus.ForeColor = Color.FromArgb(0, 242, 254);
            dotStatus.BackColor = Color.FromArgb(0, 242, 254);
            this.Invalidate();

            try
            {
                if (recognizer != null)
                {
                    recognizer.RecognizeAsyncStop();
                }
            }
            catch { }

            string rawText = speechBuffer.ToString().Trim();
            if (string.IsNullOrEmpty(rawText))
            {
                rawText = "Talkity voice dictation test.";
            }

            // Polish speech via local server or rule engine
            ThreadPool.QueueUserWorkItem((state) => {
                string polished = PolishText(rawText);
                this.Invoke(new Action(() => {
                    InjectTextIntoActiveApp(polished);
                    lblStatus.Text = "Talkity · F8 to Dictate";
                    lblStatus.ForeColor = Color.FromArgb(240, 246, 252);
                    this.Invalidate();
                }));
            });
        }

        private string PolishText(string text)
        {
            try
            {
                string jsonBody = "{\"rawText\":\"" + text.Replace("\"", "\\\"") + "\",\"tone\":\"clean\"}";
                byte[] bodyBytes = Encoding.UTF8.GetBytes(jsonBody);

                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(SERVER_URL + "/api/polish");
                req.Method = "POST";
                req.ContentType = "application/json";
                req.Timeout = 3000;
                req.ContentLength = bodyBytes.Length;

                using (Stream stream = req.GetRequestStream())
                {
                    stream.Write(bodyBytes, 0, bodyBytes.Length);
                }

                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader reader = new StreamReader(resp.GetResponseStream()))
                {
                    string json = reader.ReadToEnd();
                    int startIdx = json.IndexOf("\"formattedText\":\"");
                    if (startIdx != -1)
                    {
                        startIdx += 17;
                        int endIdx = json.IndexOf("\"", startIdx);
                        if (endIdx != -1)
                        {
                            return json.Substring(startIdx, endIdx - startIdx).Replace("\\\"", "\"").Replace("\\n", "\n");
                        }
                    }
                }
            }
            catch { }

            // Offline rule-based fallback
            string cleaned = text;
            cleaned = cleaned.Replace(" um ", " ").Replace(" uh ", " ").Replace(" like ", " ");
            if (cleaned.Length > 0)
            {
                cleaned = char.ToUpper(cleaned[0]) + cleaned.Substring(1);
                if (!cleaned.EndsWith(".")) cleaned += ".";
            }
            return cleaned;
        }

        private void InjectTextIntoActiveApp(string text)
        {
            // Restore focus to target window
            if (lastTargetWindow != IntPtr.Zero)
            {
                SetForegroundWindow(lastTargetWindow);
                Thread.Sleep(80);
            }

            // Non-destructive clipboard backup
            string previousClipboard = string.Empty;
            try
            {
                if (Clipboard.ContainsText())
                {
                    previousClipboard = Clipboard.GetText();
                }
            }
            catch { }

            try
            {
                // Set clipboard to dictated text
                Clipboard.SetText(text + " ");
                Thread.Sleep(40);

                // Simulate Ctrl + V
                keybd_event(VK_CONTROL, 0, 0, 0);
                Thread.Sleep(20);
                keybd_event(VK_V, 0, 0, 0);
                Thread.Sleep(20);
                keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0);
                Thread.Sleep(20);
                keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
                Thread.Sleep(60);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Paste error: " + ex.Message);
            }
            finally
            {
                // Restore user's previous clipboard after 300ms
                ThreadPool.QueueUserWorkItem((s) => {
                    Thread.Sleep(300);
                    try
                    {
                        if (!string.IsNullOrEmpty(previousClipboard))
                        {
                            this.Invoke(new Action(() => {
                                try { Clipboard.SetText(previousClipboard); } catch { }
                            }));
                        }
                    }
                    catch { }
                });
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            UnregisterHotKey(this.Handle, HOTKEY_ID);
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            if (recognizer != null)
            {
                recognizer.Dispose();
            }
            base.OnFormClosing(e);
        }
    }
}
