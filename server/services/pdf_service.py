import json
import calendar
from io import BytesIO
from datetime import datetime, date, time
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from server.models import Payroll, Employee

def format_late_duration_pdf(minutes) -> str:
    if not minutes or int(minutes) <= 0:
        return "—"
    m = int(minutes)
    if m < 60:
        return f"{m}m"
    hrs = m // 60
    rem = m % 60
    return f"{hrs}h {rem}m" if rem > 0 else f"{hrs}h"

def format_time_str(val):
    if not val:
        return None
    if isinstance(val, (datetime, time)):
        return val.strftime("%I:%M %p")
    s = str(val).strip()
    if " " in s or "T" in s:
        try:
            dt = datetime.fromisoformat(s.replace(" ", "T"))
            return dt.strftime("%I:%M %p")
        except Exception:
            pass
    if ":" in s and len(s) <= 8:
        try:
            parts = s.split(":")
            dt = datetime(2026, 1, 1, int(parts[0]), int(parts[1]))
            return dt.strftime("%I:%M %p")
        except Exception:
            pass
    return s

def _is_next_day(in_val, out_val):
    try:
        in_dt = in_val if isinstance(in_val, datetime) else (datetime.fromisoformat(str(in_val).replace(" ", "T")) if in_val else None)
        out_dt = out_val if isinstance(out_val, datetime) else (datetime.fromisoformat(str(out_val).replace(" ", "T")) if out_val else None)
        if in_dt and out_dt:
            return out_dt.date() > in_dt.date()
    except Exception:
        pass
    return False

def _normalize_status(status_raw) -> str:
    if hasattr(status_raw, "value"):
        return str(status_raw.value).lower().strip()
    s = str(status_raw or "absent").lower().strip()
    if "." in s:
        s = s.split(".")[-1]
    return s

# ─── Executive Color Palette ──────────────────────────────────────────────────
COLOR_PRIMARY_NAVY = colors.HexColor("#0f172a")    # Slate 900
COLOR_SECONDARY = colors.HexColor("#1e293b")        # Slate 800
COLOR_ACCENT_BLUE = colors.HexColor("#0284c7")      # Sky 600
COLOR_BORDER = colors.HexColor("#e2e8f0")           # Slate 200
COLOR_ZEBRA_LIGHT = colors.HexColor("#f8fafc")      # Slate 50
COLOR_WHITE = colors.HexColor("#ffffff")

# Status badge font colors
COLOR_STATUS_PRESENT = "#059669"   # Emerald
COLOR_STATUS_LATE = "#d97706"      # Amber
COLOR_STATUS_ABSENT = "#dc2626"    # Rose
COLOR_STATUS_HOLIDAY = "#0284c7"   # Sky blue
COLOR_STATUS_LEAVE = "#7c3aed"     # Violet
COLOR_STATUS_ACTIVE = "#b45309"    # Amber active

def _format_status_badge(status_raw: str) -> str:
    s = _normalize_status(status_raw)
    if s in ("present", "wfh"):
        return f'<font color="{COLOR_STATUS_PRESENT}"><b>{s.upper()}</b></font>'
    elif s == "late":
        return f'<font color="{COLOR_STATUS_LATE}"><b>LATE</b></font>'
    elif s in ("holiday", "weekly_off"):
        return f'<font color="{COLOR_STATUS_HOLIDAY}"><b>HOLIDAY</b></font>'
    elif s == "leave":
        return f'<font color="{COLOR_STATUS_LEAVE}"><b>LEAVE</b></font>'
    elif s in ("half_day", "halfday"):
        return f'<font color="{COLOR_STATUS_LATE}"><b>HALF DAY</b></font>'
    else:
        return f'<font color="{COLOR_STATUS_ABSENT}"><b>ABSENT</b></font>'

def format_punch_sessions_pdf(cin_raw, cout_raw, punches_raw, checkout_count=0):
    """
    Formats Check-In and Check-Out table cells for PDF.
    - Single session: standard timestamp display (e.g. 11:27 AM / 08:42 PM or Active Session).
    - Multi-session: detailed, unambiguous breakdown of every session:
        Check-In:
          <b>Session 1:</b> 11:27 AM
          <b>Session 2:</b> 12:42 PM
        Check-Out:
          <b>Session 1:</b> 12:41 PM (1.24h)
          <b>Session 2:</b> 08:42 PM (7.00h)
    """
    sessions = []
    if punches_raw:
        try:
            if isinstance(punches_raw, str):
                sessions = json.loads(punches_raw)
            elif isinstance(punches_raw, list):
                sessions = punches_raw
        except Exception:
            sessions = []

    if not sessions or len(sessions) <= 1:
        cin_str = format_time_str(cin_raw) or (str(cin_raw) if cin_raw else "--:--")
        if cin_raw and not cout_raw:
            cout_str = '<font color="#b45309"><b>Active Session</b></font>'
        else:
            cout_str = format_time_str(cout_raw) or (str(cout_raw) if cout_raw else "--:--")
        return cin_str, cout_str

    in_lines = []
    out_lines = []
    for idx, s in enumerate(sessions, 1):
        s_num = s.get("session", idx)
        in_t = format_time_str(s.get("in")) or "--:--"
        out_t = format_time_str(s.get("out"))
        hrs = s.get("hours")

        in_lines.append(f'<b>Session {s_num}:</b> {in_t}')
        if out_t:
            next_day_tag = ""
            if _is_next_day(s.get("in"), s.get("out")):
                next_day_tag = ' <font color="#7c3aed"><b>(+1d)</b></font>'
            dur_str = f" <font color='#475569'>({float(hrs):.2f}h)</font>" if hrs is not None else ""
            out_lines.append(f'<b>Session {s_num}:</b> {out_t}{next_day_tag}{dur_str}')
        else:
            out_lines.append(f'<b>Session {s_num}:</b> <font color="#b45309"><b>Active Session</b></font>')

    return "<br/>".join(in_lines), "<br/>".join(out_lines)

def _add_executive_header(story, title: str, subtitle: str, styles, right_meta: str = ""):
    """Adds a modern corporate header banner with clean typography and accent line."""
    org_style = ParagraphStyle(
        name="OrgBanner",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=COLOR_ACCENT_BLUE,
        textTransform="uppercase",
    )
    title_style = ParagraphStyle(
        name="ExecTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=19,
        textColor=COLOR_PRIMARY_NAVY,
        spaceAfter=2,
    )
    sub_style = ParagraphStyle(
        name="ExecSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#64748b"),
    )
    right_meta_style = ParagraphStyle(
        name="ExecRightMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748b"),
        alignment=2,
    )

    header_table_data = [
        [
            Paragraph("<b>SMART ATTENDANCE &amp; PAYROLL MANAGEMENT SYSTEM</b>", org_style),
            Paragraph(f"<b>REPORT GENERATED:</b> {datetime.now().strftime('%d %b %Y, %I:%M %p IST')}", right_meta_style),
        ],
        [
            Paragraph(title, title_style),
            Paragraph(right_meta or "<b>STATUS:</b> OFFICIAL ARCHIVE", right_meta_style),
        ],
        [
            Paragraph(subtitle, sub_style),
            Paragraph("", right_meta_style),
        ],
    ]

    t_head = Table(header_table_data, colWidths=[500, 240])
    t_head.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
    ]))
    story.append(t_head)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_ACCENT_BLUE, spaceBefore=2, spaceAfter=8))

def _build_kpi_summary_bar(
    total_records: int,
    present: int,
    late: int,
    absent: int,
    leave: int,
    holiday: int,
    total_hours: float,
    total_ot: float,
    total_late_min: int = 0
):
    """Builds an 8-column executive KPI dashboard strip table across 742 pt printable landscape width."""
    box_style_lbl = ParagraphStyle(
        name="KPILbl",
        fontName="Helvetica-Bold",
        fontSize=6.5,
        leading=8,
        textColor=colors.HexColor("#475569"),
        alignment=1,
    )
    box_style_val = ParagraphStyle(
        name="KPIVal",
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=12,
        alignment=1,
    )
    late_dur_str = format_late_duration_pdf(total_late_min)
    late_sub = f"<br/><font size='5.5' color='#92400e'>({late_dur_str})</font>" if (total_late_min > 0 and late_dur_str != "—") else ""
    pres_sub = f"<br/><font size='5.5' color='#059669'>(incl. late)</font>" if (late > 0 and late != present) else ""

    kpi_data = [
        [
            Paragraph("TOTAL LOGS", box_style_lbl),
            Paragraph("PRESENT", box_style_lbl),
            Paragraph("ABSENT", box_style_lbl),
            Paragraph("LATE ARRIVALS", box_style_lbl),
            Paragraph("APPROVED LEAVE", box_style_lbl),
            Paragraph("WEEKLY OFF / HOLIDAY", box_style_lbl),
            Paragraph("TOTAL WORKED", box_style_lbl),
            Paragraph("OVERTIME", box_style_lbl),
        ],
        [
            Paragraph(f"<b>{total_records}</b>", ParagraphStyle("K1", parent=box_style_val, textColor=COLOR_PRIMARY_NAVY)),
            Paragraph(f'<b><font color="{COLOR_STATUS_PRESENT}">{present}</font></b>{pres_sub}', box_style_val),
            Paragraph(f'<b><font color="{COLOR_STATUS_ABSENT}">{absent}</font></b>', box_style_val),
            Paragraph(f'<b><font color="{COLOR_STATUS_LATE}">{late}</font></b>{late_sub}', box_style_val),
            Paragraph(f'<b><font color="{COLOR_STATUS_LEAVE}">{leave}</font></b>', box_style_val),
            Paragraph(f'<b><font color="{COLOR_STATUS_HOLIDAY}">{holiday}</font></b>', box_style_val),
            Paragraph(f"<b>{total_hours:.2f}h</b>", ParagraphStyle("K2", parent=box_style_val, textColor=COLOR_PRIMARY_NAVY)),
            Paragraph(f'<b><font color="#7c3aed">+{total_ot:.2f}h</font></b>', box_style_val),
        ]
    ]

    t_kpi = Table(kpi_data, colWidths=[92, 92, 92, 94, 92, 92, 94, 94])
    t_kpi.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    return t_kpi


def _build_monthly_kpi_bar(total_staff: int, total_pres: float, total_abs: float, total_lv: float, total_ot: float, avg_att_pct: float):
    """Builds a 6-column compact executive KPI dashboard strip table across 562 pt printable portrait width."""
    box_style_lbl = ParagraphStyle(
        name="MKPILbl",
        fontName="Helvetica-Bold",
        fontSize=6.5,
        leading=8,
        textColor=colors.HexColor("#475569"),
        alignment=1,
    )
    box_style_val = ParagraphStyle(
        name="MKPIVal",
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=12,
        alignment=1,
    )

    kpi_data = [
        [
            Paragraph("TOTAL STAFF", box_style_lbl),
            Paragraph("PRESENT DAYS", box_style_lbl),
            Paragraph("ABSENT DAYS", box_style_lbl),
            Paragraph("APPROVED LEAVE", box_style_lbl),
            Paragraph("OVERTIME HOURS", box_style_lbl),
            Paragraph("AVG ATTENDANCE", box_style_lbl),
        ],
        [
            Paragraph(f"<b>{total_staff}</b>", ParagraphStyle("MK1", parent=box_style_val, textColor=COLOR_PRIMARY_NAVY)),
            Paragraph(f'<b><font color="{COLOR_STATUS_PRESENT}">{total_pres:.1f}</font></b>', box_style_val),
            Paragraph(f'<b><font color="{COLOR_STATUS_ABSENT}">{total_abs:.1f}</font></b>', box_style_val),
            Paragraph(f'<b><font color="{COLOR_STATUS_LEAVE}">{total_lv:.1f}</font></b>', box_style_val),
            Paragraph(f'<b><font color="#7c3aed">{total_ot:.2f}h</font></b>', box_style_val),
            Paragraph(f"<b>{avg_att_pct:.1f}%</b>", ParagraphStyle("MK2", parent=box_style_val, textColor=COLOR_PRIMARY_NAVY)),
        ]
    ]

    t_kpi = Table(kpi_data, colWidths=[93, 93, 93, 93, 95, 95])
    t_kpi.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    return t_kpi

# ─── 1. Payslip PDF Generator ─────────────────────────────────────────────────
def generate_payslip_pdf(payroll: Payroll, employee: Employee) -> bytes:
    """Generates an executive-grade PDF payslip for an employee."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        name="PSTitle",
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=COLOR_PRIMARY_NAVY,
        alignment=1,
    )
    sub_style = ParagraphStyle(
        name="PSSub",
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14,
        textColor=COLOR_ACCENT_BLUE,
        alignment=1,
    )
    body_style = ParagraphStyle(
        name="PSBody",
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=COLOR_SECONDARY,
    )
    bold_body = ParagraphStyle(
        name="PSBold",
        parent=body_style,
        fontName="Helvetica-Bold",
    )
    right_body = ParagraphStyle(
        name="PSRight",
        parent=body_style,
        alignment=2,
    )
    right_bold = ParagraphStyle(
        name="PSRightBold",
        parent=bold_body,
        alignment=2,
    )

    story.append(Paragraph("SMART ATTENDANCE &amp; PAYROLL MANAGEMENT SYSTEM", title_style))
    month_name = calendar.month_name[payroll.month]
    story.append(Paragraph(f"OFFICIAL SALARY PAYSLIP — {month_name.upper()} {payroll.year}", sub_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_ACCENT_BLUE, spaceBefore=8, spaceAfter=14))

    emp_code = employee.employee_code or f"EMP{employee.employee_id:03d}"
    emp_details = [
        [
            Paragraph("<b>Employee Name:</b>", body_style),
            Paragraph(employee.name, bold_body),
            Paragraph("<b>Employee ID:</b>", body_style),
            Paragraph(f'<font color="#0284c7"><b>{emp_code}</b></font>', bold_body),
        ],
        [
            Paragraph("<b>Department:</b>", body_style),
            Paragraph(employee.department or "N/A", body_style),
            Paragraph("<b>Designation:</b>", body_style),
            Paragraph(employee.designation or "Staff", body_style),
        ],
        [
            Paragraph("<b>Email:</b>", body_style),
            Paragraph(employee.email, body_style),
            Paragraph("<b>Working Days:</b>", body_style),
            Paragraph(f"{payroll.working_days} Days", body_style),
        ],
        [
            Paragraph("<b>Present Days:</b>", body_style),
            Paragraph(f"{float(payroll.present_days or 0):.1f} Days", body_style),
            Paragraph("<b>Absent Days:</b>", body_style),
            Paragraph(f"{float(payroll.absent_days or 0):.1f} Days", body_style),
        ],
        [
            Paragraph("<b>Approved Leaves:</b>", body_style),
            Paragraph(f"{payroll.leave_days} Days", body_style),
            Paragraph("<b>Overtime Hours:</b>", body_style),
            Paragraph(f'<font color="#7c3aed"><b>{float(payroll.overtime_hours or 0):.2f} hrs</b></font>', bold_body),
        ],
    ]

    t_emp = Table(emp_details, colWidths=[110, 160, 110, 160])
    t_emp.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COLOR_ZEBRA_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_emp)
    story.append(Spacer(1, 14))

    # Earnings & Deductions Breakdown
    h_style = ParagraphStyle("PSHead", fontName="Helvetica-Bold", fontSize=9, textColor=COLOR_WHITE)
    salary_data = [
        [
            Paragraph("<b>SALARY COMPONENT &amp; DESCRIPTION</b>", h_style),
            Paragraph("<b>ALLOWANCES (₹)</b>", ParagraphStyle("H1", parent=h_style, alignment=2)),
            Paragraph("<b>DEDUCTIONS (₹)</b>", ParagraphStyle("H2", parent=h_style, alignment=2)),
        ],
        [
            Paragraph("Basic Monthly Salary", body_style),
            Paragraph(f"₹ {float(payroll.basic_salary or 0):,.2f}", right_body),
            Paragraph("—", right_body),
        ],
        [
            Paragraph(f"Overtime Pay ({float(payroll.overtime_hours or 0):.2f} hrs)", body_style),
            Paragraph(f"₹ {float(payroll.overtime_pay or 0):,.2f}", right_body),
            Paragraph("—", right_body),
        ],
        [
            Paragraph("Unpaid Absences &amp; Late Penalty Deductions", body_style),
            Paragraph("—", right_body),
            Paragraph(f'<font color="#dc2626">₹ {float(payroll.deductions or 0):,.2f}</font>', right_body),
        ],
        [
            Paragraph("<b>TOTALS</b>", bold_body),
            Paragraph(f"<b>₹ {(float(payroll.basic_salary or 0) + float(payroll.overtime_pay or 0)):,.2f}</b>", right_bold),
            Paragraph(f'<b><font color="#dc2626">₹ {float(payroll.deductions or 0):,.2f}</font></b>', right_bold),
        ],
        [
            Paragraph(f"<b>NET SALARY DISBURSED</b><br/><font size='7' color='#64748b'>Payment Status: {'PAID' if payroll.is_paid else 'PENDING'}</font>", bold_body),
            Paragraph(f'<font size="12" color="#059669"><b>₹ {float(payroll.final_salary or 0):,.2f}</b></font>', ParagraphStyle("N1", parent=right_bold, fontSize=12)),
            Paragraph("", right_body),
        ],
    ]

    t_sal = Table(salary_data, colWidths=[270, 135, 135])
    t_sal.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY_NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), COLOR_WHITE),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-3), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -3), [COLOR_WHITE, COLOR_ZEBRA_LIGHT]),
        ('BACKGROUND', (0,-2), (-1,-2), colors.HexColor("#f1f5f9")),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#ecfdf5")),
        ('LINEABOVE', (0,-2), (-1,-2), 1, COLOR_PRIMARY_NAVY),
        ('LINEABOVE', (0,-1), (-1,-1), 1.5, colors.HexColor("#059669")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_sal)
    story.append(Spacer(1, 20))

    note_style = ParagraphStyle(
        name="PSNote",
        fontName="Helvetica-Oblique",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#64748b"),
        alignment=1,
    )
    story.append(Paragraph("This is a computer-generated salary slip and does not require a physical signature.", note_style))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

# ─── 2. Daily Attendance PDF Generator ────────────────────────────────────────
def generate_daily_attendance_pdf(report_date: date, records: list, title: str = "DAILY ATTENDANCE REPORT", subtitle: str = None) -> bytes:
    """Generates PDF for Daily Attendance with executive styling, KPI strip, and clear multi-session timing."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=25,
        leftMargin=25,
        topMargin=25,
        bottomMargin=25
    )
    story = []
    styles = getSampleStyleSheet()

    sub = subtitle or f"Report Date: {report_date.strftime('%A, %d %B %Y')} | Department: All"
    _add_executive_header(story, title, sub, styles, f"DATE: {report_date.strftime('%d-%m-%Y')}")

    total_logs = len(records)
    present_cnt = sum(1 for r in records if _normalize_status(r.get("status")) in ("present", "wfh", "late", "half_day", "halfday"))
    late_cnt = sum(1 for r in records if _normalize_status(r.get("status")) == "late" or (r.get("late_minutes") and int(r.get("late_minutes")) > 0))
    absent_cnt = sum(1 for r in records if _normalize_status(r.get("status")) == "absent")
    leave_cnt = sum(1 for r in records if _normalize_status(r.get("status")) == "leave")
    holiday_cnt = sum(1 for r in records if _normalize_status(r.get("status")) in ("holiday", "weekly_off"))
    total_late_min = sum(int(r.get("late_minutes") or 0) for r in records)
    total_hrs = sum(float(r.get("working_hours") or 0.0) for r in records)
    total_ot = sum(float(r.get("overtime_hours") or 0.0) for r in records)
    total_checkouts = sum(int(r.get("checkout_count") or (1 if r.get("check_out") else 0)) for r in records)

    story.append(_build_kpi_summary_bar(total_logs, present_cnt, late_cnt, absent_cnt, leave_cnt, holiday_cnt, total_hrs, total_ot, total_late_min))
    story.append(Spacer(1, 8))

    header_style = ParagraphStyle("HDaily", fontName="Helvetica-Bold", fontSize=8, textColor=COLOR_WHITE, alignment=1)
    row_style = ParagraphStyle("RDaily", fontName="Helvetica", fontSize=8, textColor=COLOR_SECONDARY)
    row_center = ParagraphStyle("RDailyC", parent=row_style, alignment=1)
    row_right = ParagraphStyle("RDailyR", parent=row_style, alignment=2)

    table_data = [[
        Paragraph("<b>ID</b>", header_style),
        Paragraph("<b>Employee Name</b>", header_style),
        Paragraph("<b>Department</b>", header_style),
        Paragraph("<b>Check-In Time</b>", header_style),
        Paragraph("<b>Check-Out Time &amp; Sessions</b>", header_style),
        Paragraph("<b>Hours</b>", header_style),
        Paragraph("<b>Overtime</b>", header_style),
        Paragraph("<b>Status</b>", header_style),
        Paragraph("<b>Source</b>", header_style),
    ]]

    for r in records:
        emp_code = r.get("employee_code") or f"EMP{int(r.get('employee_id') or 0):03d}"
        cin_display, cout_display = format_punch_sessions_pdf(
            r.get("check_in"),
            r.get("check_out"),
            r.get("punches"),
            r.get("checkout_count") or 0
        )
        status_badge = _format_status_badge(r.get("status"))

        table_data.append([
            Paragraph(f"<b>{emp_code}</b>", row_center),
            Paragraph(f"<b>{r.get('employee_name') or 'Unknown'}</b>", row_style),
            Paragraph(r.get("department") or "N/A", row_style),
            Paragraph(cin_display, row_center),
            Paragraph(cout_display, row_center),
            Paragraph(f"{float(r.get('working_hours') or 0.00):.2f}h", row_right),
            Paragraph(f"{float(r.get('overtime_hours') or 0.00):.2f}h", row_right),
            Paragraph(status_badge, row_center),
            Paragraph(str(r.get("source") or "Biometric").capitalize(), row_center),
        ])

    # Append Grand Total Summary Row
    table_data.append([
        Paragraph("<b>TOTALS</b>", row_center),
        Paragraph("<b>GRAND TOTALS</b>", ParagraphStyle("B1", parent=row_style, fontName="Helvetica-Bold", textColor=COLOR_PRIMARY_NAVY)),
        Paragraph(f"<b>{total_logs} Staff Records</b>", ParagraphStyle("B2", parent=row_style, fontName="Helvetica-Bold", textColor=colors.HexColor("#475569"))),
        Paragraph(f'<b><font color="{COLOR_STATUS_PRESENT}">P: {present_cnt}</font> | <font color="{COLOR_STATUS_ABSENT}">A: {absent_cnt}</font></b>', row_center),
        Paragraph(f'<b>Late: {late_cnt}</b> ({format_late_duration_pdf(total_late_min)})', row_center),
        Paragraph(f"<b>{total_hrs:.2f}h</b>", ParagraphStyle("BHrs", parent=row_right, fontName="Helvetica-Bold", textColor=COLOR_PRIMARY_NAVY)),
        Paragraph(f'<b><font color="#7c3aed">+{total_ot:.2f}h</font></b>', ParagraphStyle("BOT", parent=row_right, fontName="Helvetica-Bold")),
        Paragraph(f'<b>P:{present_cnt} A:{absent_cnt} L:{late_cnt}</b>', row_center),
        Paragraph(f"<b>{total_checkouts} COs</b>", row_center),
    ])

    # Col widths sum to 742 pt
    t = Table(table_data, colWidths=[50, 120, 80, 95, 145, 56, 66, 70, 60])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY_NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), COLOR_WHITE),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-2), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [COLOR_WHITE, COLOR_ZEBRA_LIGHT]),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#f1f5f9")),
        ('LINEABOVE', (0,-1), (-1,-1), 1.5, COLOR_PRIMARY_NAVY),
        ('LINEBELOW', (0,-1), (-1,-1), 1.5, COLOR_PRIMARY_NAVY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,0), 6),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('TOPPADDING', (0,-1), (-1,-1), 5),
        ('BOTTOMPADDING', (0,-1), (-1,-1), 5),
    ]))
    story.append(t)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

# ─── 3. Monthly Attendance Summary PDF Generator ──────────────────────────────
def generate_monthly_attendance_pdf(year: int, month: int, summaries: list, title: str = "MONTHLY ATTENDANCE SUMMARY", subtitle: str = None) -> bytes:
    """Generates PDF for Monthly Attendance Summary."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=25,
        leftMargin=25,
        topMargin=25,
        bottomMargin=25
    )
    story = []
    styles = getSampleStyleSheet()

    month_name = calendar.month_name[month]
    sub = subtitle or f"Period: {month_name} {year} | All Employees"
    _add_executive_header(story, title, sub, styles, f"MONTH: {month_name.upper()} {year}")

    total_staff = len(summaries)
    total_pres = sum(float(s.get("present_days") or 0.0) for s in summaries)
    total_abs = sum(float(s.get("absent_days") or 0.0) for s in summaries)
    total_lv = sum(float(s.get("leave_days") or 0.0) for s in summaries)
    total_ot = sum(float(s.get("overtime_hours") or 0.00) for s in summaries)
    total_w_days = total_pres + total_abs + total_lv
    avg_att = (total_pres / total_w_days * 100.0) if total_w_days > 0 else 0.0

    story.append(_build_monthly_kpi_bar(total_staff, total_pres, total_abs, total_lv, total_ot, avg_att))
    story.append(Spacer(1, 8))

    header_style = ParagraphStyle("HMon", fontName="Helvetica-Bold", fontSize=8.5, textColor=COLOR_WHITE, alignment=1)
    row_style = ParagraphStyle("RMon", fontName="Helvetica", fontSize=8.5, textColor=COLOR_SECONDARY)
    row_center = ParagraphStyle("RMonC", parent=row_style, alignment=1)
    row_right = ParagraphStyle("RMonR", parent=row_style, alignment=2)

    table_data = [[
        Paragraph("<b>ID</b>", header_style),
        Paragraph("<b>Employee Name</b>", header_style),
        Paragraph("<b>Department</b>", header_style),
        Paragraph("<b>Present Days</b>", header_style),
        Paragraph("<b>Absent Days</b>", header_style),
        Paragraph("<b>Leaves</b>", header_style),
        Paragraph("<b>OT Hours</b>", header_style),
    ]]

    for s in summaries:
        emp_code = s.get("employee_code") or f"EMP{int(s.get('employee_id') or 0):03d}"
        table_data.append([
            Paragraph(f"<b>{emp_code}</b>", row_center),
            Paragraph(f"<b>{s.get('employee_name')}</b>", row_style),
            Paragraph(s.get("department") or "N/A", row_style),
            Paragraph(f'<font color="{COLOR_STATUS_PRESENT}"><b>{float(s.get("present_days") or 0.0):.1f}</b></font>', row_center),
            Paragraph(f'<font color="{COLOR_STATUS_ABSENT}"><b>{float(s.get("absent_days") or 0.0):.1f}</b></font>', row_center),
            Paragraph(f'<font color="{COLOR_STATUS_LEAVE}"><b>{float(s.get("leave_days") or 0.0):.1f}</b></font>', row_center),
            Paragraph(f'<font color="#7c3aed"><b>{float(s.get("overtime_hours") or 0.00):.2f}h</b></font>', row_right),
        ])

    table_data.append([
        Paragraph("<b>TOTALS</b>", row_center),
        Paragraph(f"<b>GRAND TOTALS ({total_staff} Staff)</b>", ParagraphStyle("BM1", parent=row_style, fontName="Helvetica-Bold", textColor=COLOR_PRIMARY_NAVY)),
        Paragraph("<b>Company Roster</b>", ParagraphStyle("BM2", parent=row_style, fontName="Helvetica-Bold", textColor=colors.HexColor("#475569"))),
        Paragraph(f'<b><font color="{COLOR_STATUS_PRESENT}">{total_pres:.1f}</font></b>', row_center),
        Paragraph(f'<b><font color="{COLOR_STATUS_ABSENT}">{total_abs:.1f}</font></b>', row_center),
        Paragraph(f'<b><font color="{COLOR_STATUS_LEAVE}">{total_lv:.1f}</font></b>', row_center),
        Paragraph(f'<b><font color="#7c3aed">{total_ot:.2f}h</font></b>', row_right),
    ])

    t = Table(table_data, colWidths=[60, 160, 112, 60, 55, 55, 60])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY_NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), COLOR_WHITE),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-2), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [COLOR_WHITE, COLOR_ZEBRA_LIGHT]),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#f1f5f9")),
        ('LINEABOVE', (0,-1), (-1,-1), 1.5, COLOR_PRIMARY_NAVY),
        ('LINEBELOW', (0,-1), (-1,-1), 1.5, COLOR_PRIMARY_NAVY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,0), 6),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('TOPPADDING', (0,-1), (-1,-1), 6),
        ('BOTTOMPADDING', (0,-1), (-1,-1), 6),
    ]))
    story.append(t)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

# ─── 4. Monthly Payroll Report PDF Generator ──────────────────────────────────
def generate_payroll_report_pdf(year: int, month: int, payrolls: list) -> bytes:
    """Generates an executive-grade PDF report for Monthly Payroll distribution."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=25,
        leftMargin=25,
        topMargin=25,
        bottomMargin=25
    )
    story = []
    styles = getSampleStyleSheet()

    month_name = calendar.month_name[month]
    _add_executive_header(
        story,
        "MONTHLY PAYROLL DISBURSEMENT REPORT",
        f"Period: {month_name} {year} | All Employees Summary",
        styles,
        f"PERIOD: {month_name.upper()} {year}"
    )

    header_style = ParagraphStyle("HPay", fontName="Helvetica-Bold", fontSize=8, textColor=COLOR_WHITE, alignment=1)
    row_style = ParagraphStyle("RPay", fontName="Helvetica", fontSize=8, textColor=COLOR_SECONDARY)
    row_center = ParagraphStyle("RPayC", parent=row_style, alignment=1)
    row_right = ParagraphStyle("RPayR", parent=row_style, alignment=2)
    bold_right = ParagraphStyle("BPayR", parent=row_style, fontName="Helvetica-Bold", alignment=2, textColor=COLOR_PRIMARY_NAVY)

    table_data = [[
        Paragraph("<b>ID</b>", header_style),
        Paragraph("<b>Employee Name</b>", header_style),
        Paragraph("<b>Department</b>", header_style),
        Paragraph("<b>Days Pres.</b>", header_style),
        Paragraph("<b>Basic (₹)</b>", header_style),
        Paragraph("<b>OT Pay (₹)</b>", header_style),
        Paragraph("<b>Deductions (₹)</b>", header_style),
        Paragraph("<b>Net Salary (₹)</b>", header_style),
        Paragraph("<b>Status</b>", header_style),
    ]]

    total_basic = 0.0
    total_ot = 0.0
    total_ded = 0.0
    total_net = 0.0

    for p in payrolls:
        basic = float(p.get("basic_salary") or 0.0)
        ot = float(p.get("overtime_pay") or 0.0)
        ded = float(p.get("deductions") or 0.0)
        net = float(p.get("final_salary") or 0.0)

        total_basic += basic
        total_ot += ot
        total_ded += ded
        total_net += net

        is_paid = bool(p.get("is_paid"))
        status_html = '<font color="#059669"><b>PAID</b></font>' if is_paid else '<font color="#dc2626"><b>UNPAID</b></font>'
        emp_code = p.get("employee_code") or f"EMP{int(p.get('employee_id') or 0):03d}"

        table_data.append([
            Paragraph(f"<b>{emp_code}</b>", row_center),
            Paragraph(f"<b>{p.get('employee_name')}</b>", row_style),
            Paragraph(p.get("department") or "N/A", row_style),
            Paragraph(f"{float(p.get('present_days') or 0.0):.1f}", row_center),
            Paragraph(f"₹ {basic:,.2f}", row_right),
            Paragraph(f"₹ {ot:,.2f}", row_right),
            Paragraph(f'<font color="#dc2626">₹ {ded:,.2f}</font>', row_right),
            Paragraph(f'<b><font color="#059669">₹ {net:,.2f}</font></b>', row_right),
            Paragraph(status_html, row_center),
        ])

    table_data.append([
        Paragraph("", bold_right),
        Paragraph("<b>GRAND TOTALS</b>", ParagraphStyle("BTot", parent=row_style, fontName="Helvetica-Bold", textColor=COLOR_PRIMARY_NAVY)),
        Paragraph("", bold_right),
        Paragraph("", bold_right),
        Paragraph(f"<b>₹ {total_basic:,.2f}</b>", bold_right),
        Paragraph(f"<b>₹ {total_ot:,.2f}</b>", bold_right),
        Paragraph(f'<b><font color="#dc2626">₹ {total_ded:,.2f}</font></b>', bold_right),
        Paragraph(f'<b><font color="#059669">₹ {total_net:,.2f}</font></b>', bold_right),
        Paragraph("", bold_right),
    ])

    t = Table(table_data, colWidths=[55, 140, 95, 60, 80, 80, 80, 92, 60])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY_NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), COLOR_WHITE),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-2), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [COLOR_WHITE, COLOR_ZEBRA_LIGHT]),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#f1f5f9")),
        ('LINEABOVE', (0,-1), (-1,-1), 1.5, COLOR_PRIMARY_NAVY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,0), 6),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
    ]))
    story.append(t)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

# ─── 5. Historical / Detailed Attendance PDF Generator ────────────────────────
def generate_historical_attendance_pdf(start_date: date, end_date: date, records: list, title: str = "HISTORICAL ATTENDANCE REPORT", subtitle: str = None) -> bytes:
    """Generates an executive PDF for Detailed Attendance logs with KPI strip and complete session timings."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=25,
        leftMargin=25,
        topMargin=25,
        bottomMargin=25
    )
    story = []
    styles = getSampleStyleSheet()

    sub = subtitle or f"Period: {start_date.strftime('%d %B %Y')} to {end_date.strftime('%d %B %Y')} | Department: All"
    _add_executive_header(story, title, sub, styles, f"PERIOD: {start_date.strftime('%d/%m/%Y')} - {end_date.strftime('%d/%m/%Y')}")

    total_logs = len(records)
    present_cnt = sum(1 for r in records if _normalize_status(r.get("status")) in ("present", "wfh", "late", "half_day", "halfday"))
    late_cnt = sum(1 for r in records if _normalize_status(r.get("status")) == "late" or (r.get("late_minutes") and int(r.get("late_minutes")) > 0))
    absent_cnt = sum(1 for r in records if _normalize_status(r.get("status")) == "absent")
    leave_cnt = sum(1 for r in records if _normalize_status(r.get("status")) == "leave")
    holiday_cnt = sum(1 for r in records if _normalize_status(r.get("status")) in ("holiday", "weekly_off"))
    total_late_min = sum(int(r.get("late_minutes") or 0) for r in records)
    total_hrs = sum(float(r.get("working_hours") or 0.0) for r in records)
    total_ot = sum(float(r.get("overtime_hours") or 0.0) for r in records)
    total_checkouts = sum(int(r.get("checkout_count") or (1 if r.get("check_out") else 0)) for r in records)

    story.append(_build_kpi_summary_bar(total_logs, present_cnt, late_cnt, absent_cnt, leave_cnt, holiday_cnt, total_hrs, total_ot, total_late_min))
    story.append(Spacer(1, 8))

    header_style = ParagraphStyle("HHist", fontName="Helvetica-Bold", fontSize=8, textColor=COLOR_WHITE, alignment=1)
    row_style = ParagraphStyle("RHist", fontName="Helvetica", fontSize=8, textColor=COLOR_SECONDARY)
    row_center = ParagraphStyle("RHistC", parent=row_style, alignment=1)
    row_right = ParagraphStyle("RHistR", parent=row_style, alignment=2)

    table_data = [[
        Paragraph("<b>Date</b>", header_style),
        Paragraph("<b>ID</b>", header_style),
        Paragraph("<b>Employee Name</b>", header_style),
        Paragraph("<b>Department</b>", header_style),
        Paragraph("<b>Check-In Time</b>", header_style),
        Paragraph("<b>Check-Out Time &amp; Sessions</b>", header_style),
        Paragraph("<b>Hours</b>", header_style),
        Paragraph("<b>Late</b>", header_style),
        Paragraph("<b>Overtime</b>", header_style),
        Paragraph("<b>Status</b>", header_style),
    ]]

    for r in records:
        r_date = r.get("date")
        if hasattr(r_date, "strftime"):
            date_str = r_date.strftime("%d-%m-%Y")
        else:
            date_str = str(r_date) if r_date else "--"

        emp_code = r.get("employee_code") or f"EMP{int(r.get('employee_id') or 0):03d}"
        cin_str, cout_str = format_punch_sessions_pdf(
            r.get("check_in"),
            r.get("check_out"),
            r.get("punches"),
            r.get("checkout_count") or 0
        )

        late_min = int(r.get("late_minutes") or 0)
        late_str = format_late_duration_pdf(late_min)
        status_badge = _format_status_badge(r.get("status"))

        table_data.append([
            Paragraph(date_str, row_center),
            Paragraph(f"<b>{emp_code}</b>", row_center),
            Paragraph(f"<b>{r.get('employee_name') or 'Unknown'}</b>", row_style),
            Paragraph(r.get("department") or "N/A", row_style),
            Paragraph(cin_str, row_center),
            Paragraph(cout_str, row_center),
            Paragraph(f"{float(r.get('working_hours') or 0.00):.2f}h", row_right),
            Paragraph(late_str, row_center),
            Paragraph(f"{float(r.get('overtime_hours') or 0.00):.2f}h", row_right),
            Paragraph(status_badge, row_center),
        ])

    # Append Grand Total Summary Row
    table_data.append([
        Paragraph("<b>TOTALS</b>", row_center),
        Paragraph("<b>ALL</b>", row_center),
        Paragraph("<b>GRAND TOTALS</b>", ParagraphStyle("BH1", parent=row_style, fontName="Helvetica-Bold", textColor=COLOR_PRIMARY_NAVY)),
        Paragraph(f"<b>{total_logs} Logs</b>", ParagraphStyle("BH2", parent=row_style, fontName="Helvetica-Bold", textColor=colors.HexColor("#475569"))),
        Paragraph(f'<b><font color="{COLOR_STATUS_PRESENT}">P: {present_cnt}</font> | <font color="{COLOR_STATUS_ABSENT}">A: {absent_cnt}</font></b>', row_center),
        Paragraph(f'<b>COs: {total_checkouts}</b> | Lv: {leave_cnt} | Hol: {holiday_cnt}', row_center),
        Paragraph(f"<b>{total_hrs:.2f}h</b>", ParagraphStyle("BHHrs", parent=row_right, fontName="Helvetica-Bold", textColor=COLOR_PRIMARY_NAVY)),
        Paragraph(f"<b>{format_late_duration_pdf(total_late_min)}</b>", row_center),
        Paragraph(f'<b><font color="#7c3aed">+{total_ot:.2f}h</font></b>', ParagraphStyle("BHOT", parent=row_right, fontName="Helvetica-Bold")),
        Paragraph(f'<b>P:{present_cnt} A:{absent_cnt} L:{late_cnt}</b>', row_center),
    ])

    # Table column widths sum to 742 pt (exact printable landscape width)
    t = Table(table_data, colWidths=[60, 50, 110, 72, 95, 135, 46, 46, 58, 70])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY_NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), COLOR_WHITE),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-2), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [COLOR_WHITE, COLOR_ZEBRA_LIGHT]),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#f1f5f9")),
        ('LINEABOVE', (0,-1), (-1,-1), 1.5, COLOR_PRIMARY_NAVY),
        ('LINEBELOW', (0,-1), (-1,-1), 1.5, COLOR_PRIMARY_NAVY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,0), 6),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('TOPPADDING', (0,-1), (-1,-1), 5),
        ('BOTTOMPADDING', (0,-1), (-1,-1), 5),
    ]))
    story.append(t)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
