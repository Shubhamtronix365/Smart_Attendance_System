import calendar
from io import BytesIO
from datetime import datetime, date
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from server.models import Payroll, Employee

def generate_payslip_pdf(payroll: Payroll, employee: Employee) -> bytes:
    """
    Generates a professional PDF payslip for an employee.
    Returns the PDF content as a bytes object.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    story = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        name="TitleStyle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f1629"),
        alignment=1
    )
    
    subtitle_style = ParagraphStyle(
        name="SubtitleStyle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#7c3aed"),
        alignment=1
    )
    
    section_heading = ParagraphStyle(
        name="SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#0f1629"),
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        name="BodyStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155")
    )
    
    bold_body = ParagraphStyle(
        name="BoldBody",
        parent=body_style,
        fontName="Helvetica-Bold"
    )
    
    right_bold_body = ParagraphStyle(
        name="RightBoldBody",
        parent=bold_body,
        alignment=2
    )

    right_body = ParagraphStyle(
        name="RightBody",
        parent=body_style,
        alignment=2
    )
    
    story.append(Paragraph("SMART ATTENDANCE & PAYROLL SYSTEM", title_style))
    month_name = calendar.month_name[payroll.month]
    story.append(Paragraph(f"PAYSLIP FOR {month_name.upper()} {payroll.year}", subtitle_style))
    story.append(Spacer(1, 20))
    
    emp_details = [
        [
            Paragraph("<b>Employee ID:</b>", body_style),
            Paragraph(str(employee.employee_id), body_style),
            Paragraph("<b>Name:</b>", body_style),
            Paragraph(employee.name, body_style)
        ],
        [
            Paragraph("<b>Department:</b>", body_style),
            Paragraph(employee.department or "N/A", body_style),
            Paragraph("<b>Designation:</b>", body_style),
            Paragraph(employee.designation or "N/A", body_style)
        ],
        [
            Paragraph("<b>Phone:</b>", body_style),
            Paragraph(employee.phone or "N/A", body_style),
            Paragraph("<b>Email:</b>", body_style),
            Paragraph(employee.email, body_style)
        ]
    ]
    
    t_details = Table(emp_details, colWidths=[100, 160, 100, 160])
    t_details.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#e2e8f0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#f1f5f9")),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_details)
    story.append(Spacer(1, 15))
    
    story.append(Paragraph("Attendance Summary", section_heading))
    attendance_data = [
        [
            Paragraph("<b>Total Working Days</b>", bold_body),
            Paragraph("<b>Days Present</b>", bold_body),
            Paragraph("<b>Days Absent</b>", bold_body),
            Paragraph("<b>Leave Days</b>", bold_body),
            Paragraph("<b>Overtime (hrs)</b>", bold_body),
        ],
        [
            Paragraph(str(payroll.working_days), body_style),
            Paragraph(str(payroll.present_days), body_style),
            Paragraph(str(payroll.absent_days), body_style),
            Paragraph(str(payroll.leave_days), body_style),
            Paragraph(f"{payroll.overtime_hours:.2f}", body_style),
        ]
    ]
    t_att = Table(attendance_data, colWidths=[104, 104, 104, 104, 104])
    t_att.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f1f5f9")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#e2e8f0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_att)
    story.append(Spacer(1, 15))
    
    story.append(Paragraph("Earnings and Deductions", section_heading))
    salary_data = [
        [
            Paragraph("<b>Description</b>", bold_body),
            Paragraph("<b>Earnings (INR)</b>", right_bold_body),
            Paragraph("<b>Deductions (INR)</b>", right_bold_body)
        ],
        [
            Paragraph("Basic Salary", body_style),
            Paragraph(f"{payroll.basic_salary:,.2f}", right_body),
            Paragraph("-", right_body)
        ],
        [
            Paragraph("Overtime Allowance", body_style),
            Paragraph(f"{payroll.overtime_pay:,.2f}", right_body),
            Paragraph("-", right_body)
        ],
        [
            Paragraph("Loss of Pay (Absent Days)", body_style),
            Paragraph("-", right_body),
            Paragraph(f"{payroll.deductions:,.2f}", right_body)
        ],
        [
            Paragraph("<b>Net Salary Payable</b>", bold_body),
            Paragraph(f"<b>{payroll.final_salary:,.2f}</b>", right_bold_body),
            Paragraph("-", right_bold_body)
        ]
    ]
    
    t_sal = Table(salary_data, colWidths=[240, 140, 140])
    t_sal.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f1f5f9")),
        ('LINEBELOW', (0,0), (-1,0), 1.5, colors.HexColor("#cbd5e1")),
        ('LINEBELOW', (0,1), (-1,-2), 0.5, colors.HexColor("#f1f5f9")),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#f8fafc")),
        ('LINEABOVE', (0,-1), (-1,-1), 1.5, colors.HexColor("#0f1629")),
        ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor("#0f1629")),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_sal)
    story.append(Spacer(1, 40))
    
    now_str = datetime.now().strftime("%Y-%m-%d %I:%M %p")
    footer_data = [
        [
            Paragraph(f"Generated on: {now_str}<br/>Status: <b>{'PAID' if payroll.is_paid else 'UNPAID'}</b>", body_style),
            Paragraph("____________________________<br/>Authorized HR Signature", right_body)
        ]
    ]
    t_foot = Table(footer_data, colWidths=[260, 260])
    t_foot.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
    ]))
    story.append(t_foot)
    
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

# Helper for report styling
def _add_report_header(story, title, subtitle, styles):
    title_style = ParagraphStyle(
        name="RepTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f1629")
    )
    sub_style = ParagraphStyle(
        name="RepSub",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#7c3aed"),
        spaceAfter=15
    )
    story.append(Paragraph(title, title_style))
    story.append(Paragraph(subtitle, sub_style))

def generate_daily_attendance_pdf(report_date: date, records: list) -> bytes:
    """Generates PDF for Daily Attendance Report."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=30,
        leftMargin=30,
        topMargin=30,
        bottomMargin=30
    )
    story = []
    styles = getSampleStyleSheet()
    
    _add_report_header(
        story, 
        "DAILY ATTENDANCE REPORT", 
        f"Generated on: {datetime.now().strftime('%Y-%m-%d %I:%M %p')} | Report Date: {report_date.strftime('%B %d, %Y')}", 
        styles
    )
    
    header_style = ParagraphStyle("HStyle", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, color=colors.white)
    row_style = ParagraphStyle("RStyle", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#1e293b"))
    
    table_data = [[
        Paragraph("<b>ID</b>", header_style),
        Paragraph("<b>Name</b>", header_style),
        Paragraph("<b>Department</b>", header_style),
        Paragraph("<b>Check-In</b>", header_style),
        Paragraph("<b>Check-Out</b>", header_style),
        Paragraph("<b>Hours</b>", header_style),
        Paragraph("<b>Overtime</b>", header_style),
        Paragraph("<b>Status</b>", header_style),
        Paragraph("<b>Source</b>", header_style)
    ]]
    
    for r in records:
        cin = r.get("check_in")
        cout = r.get("check_out")
        table_data.append([
            Paragraph(str(r.get("employee_id")), row_style),
            Paragraph(r.get("employee_name"), row_style),
            Paragraph(r.get("department") or "N/A", row_style),
            Paragraph(cin.strftime("%I:%M %p") if cin else "--:--", row_style),
            Paragraph(cout.strftime("%I:%M %p") if cout else "--:--", row_style),
            Paragraph(f"{float(r.get('working_hours') or 0.00):.2f}", row_style),
            Paragraph(f"{float(r.get('overtime_hours') or 0.00):.2f}", row_style),
            Paragraph(str(r.get("status")).upper(), row_style),
            Paragraph(str(r.get("source")).capitalize(), row_style)
        ])
        
    t = Table(table_data, colWidths=[40, 120, 100, 75, 75, 55, 55, 60, 60])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0f1629")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#e2e8f0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t)
    
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

def generate_monthly_attendance_pdf(year: int, month: int, summaries: list) -> bytes:
    """Generates PDF for Monthly Attendance Summary."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=30,
        leftMargin=30,
        topMargin=30,
        bottomMargin=30
    )
    story = []
    styles = getSampleStyleSheet()
    
    month_name = calendar.month_name[month]
    _add_report_header(
        story, 
        "MONTHLY ATTENDANCE SUMMARY", 
        f"Period: {month_name} {year} | Generated on: {datetime.now().strftime('%Y-%m-%d %I:%M %p')}", 
        styles
    )
    
    header_style = ParagraphStyle("HStyle", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, color=colors.white)
    row_style = ParagraphStyle("RStyle", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#1e293b"))
    
    table_data = [[
        Paragraph("<b>ID</b>", header_style),
        Paragraph("<b>Employee Name</b>", header_style),
        Paragraph("<b>Department</b>", header_style),
        Paragraph("<b>Present</b>", header_style),
        Paragraph("<b>Absent</b>", header_style),
        Paragraph("<b>Leaves</b>", header_style),
        Paragraph("<b>OT Hours</b>", header_style)
    ]]
    
    for s in summaries:
        table_data.append([
            Paragraph(str(s.get("employee_id")), row_style),
            Paragraph(s.get("employee_name"), row_style),
            Paragraph(s.get("department") or "N/A", row_style),
            Paragraph(f"{float(s.get('present_days') or 0.0):.1f}", row_style),
            Paragraph(f"{float(s.get('absent_days') or 0.0):.1f}", row_style),
            Paragraph(f"{float(s.get('leave_days') or 0.0):.1f}", row_style),
            Paragraph(f"{float(s.get('overtime_hours') or 0.00):.2f}", row_style)
        ])
        
    t = Table(table_data, colWidths=[45, 155, 110, 60, 60, 60, 60])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0f1629")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#e2e8f0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t)
    
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

def generate_payroll_report_pdf(year: int, month: int, payrolls: list) -> bytes:
    """Generates PDF for Monthly Payroll Report."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=30,
        leftMargin=30,
        topMargin=30,
        bottomMargin=30
    )
    story = []
    styles = getSampleStyleSheet()
    
    month_name = calendar.month_name[month]
    _add_report_header(
        story, 
        "MONTHLY PAYROLL SUMMARY", 
        f"Period: {month_name} {year} | Generated on: {datetime.now().strftime('%Y-%m-%d %I:%M %p')}", 
        styles
    )
    
    header_style = ParagraphStyle("HStyle", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, color=colors.white)
    row_style = ParagraphStyle("RStyle", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#1e293b"))
    bold_row = ParagraphStyle("BRowStyle", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor("#0f1629"))
    
    table_data = [[
        Paragraph("<b>ID</b>", header_style),
        Paragraph("<b>Employee Name</b>", header_style),
        Paragraph("<b>Department</b>", header_style),
        Paragraph("<b>Pres. Days</b>", header_style),
        Paragraph("<b>Basic (INR)</b>", header_style),
        Paragraph("<b>OT Pay (INR)</b>", header_style),
        Paragraph("<b>Deductions</b>", header_style),
        Paragraph("<b>Net Pay (INR)</b>", header_style),
        Paragraph("<b>Status</b>", header_style)
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
        
        table_data.append([
            Paragraph(str(p.get("employee_id")), row_style),
            Paragraph(p.get("employee_name"), row_style),
            Paragraph(p.get("department") or "N/A", row_style),
            Paragraph(f"{float(p.get('present_days') or 0.0):.1f}", row_style),
            Paragraph(f"{basic:,.2f}", row_style),
            Paragraph(f"{ot:,.2f}", row_style),
            Paragraph(f"{ded:,.2f}", row_style),
            Paragraph(f"{net:,.2f}", row_style),
            Paragraph("PAID" if p.get("is_paid") else "UNPAID", row_style)
        ])
        
    # Totals Row
    table_data.append([
        Paragraph("", bold_row),
        Paragraph("Total", bold_row),
        Paragraph("", bold_row),
        Paragraph("", bold_row),
        Paragraph(f"{total_basic:,.2f}", bold_row),
        Paragraph(f"{total_ot:,.2f}", bold_row),
        Paragraph(f"{total_ded:,.2f}", bold_row),
        Paragraph(f"{total_net:,.2f}", bold_row),
        Paragraph("", bold_row)
    ])
    
    t = Table(table_data, colWidths=[35, 130, 95, 60, 75, 75, 75, 80, 55])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0f1629")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#e2e8f0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#f8fafc")),
        ('LINEABOVE', (0,-1), (-1,-1), 1.5, colors.HexColor("#0f1629")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t)
    
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
