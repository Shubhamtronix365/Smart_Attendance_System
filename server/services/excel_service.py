import calendar
from io import BytesIO
from datetime import date
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

# Design Theme Palette (matching Neo-Glass / Charcoal professional feel)
FONT_NAME = "Segoe UI"
HEADER_FILL = PatternFill(start_color="0F1629", end_color="0F1629", fill_type="solid")
HEADER_FONT = Font(name=FONT_NAME, size=11, bold=True, color="FFFFFF")
TITLE_FONT = Font(name=FONT_NAME, size=16, bold=True, color="0F1629")
SUBTITLE_FONT = Font(name=FONT_NAME, size=11, italic=True, color="7C3AED")
BOLD_FONT = Font(name=FONT_NAME, size=10, bold=True)
REGULAR_FONT = Font(name=FONT_NAME, size=10)

ALIGN_LEFT = Alignment(horizontal="left", vertical="center")
ALIGN_CENTER = Alignment(horizontal="center", vertical="center")
ALIGN_RIGHT = Alignment(horizontal="right", vertical="center")

THIN_BORDER = Border(
    left=Side(style='thin', color='E2E8F0'),
    right=Side(style='thin', color='E2E8F0'),
    top=Side(style='thin', color='E2E8F0'),
    bottom=Side(style='thin', color='E2E8F0')
)

TOTAL_BORDER = Border(
    top=Side(style='thin', color='0F1629'),
    bottom=Side(style='double', color='0F1629')
)

def _autofit_columns(ws):
    """Automatically fits column widths to their content."""
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            # Check cell value length
            if cell.value is not None:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

def generate_daily_attendance_excel(report_date: date, records: list) -> bytes:
    """
    Generates a daily attendance report Excel.
    records is a list of dictionaries/objects containing:
    [employee_id, employee_name, department, check_in, check_out, working_hours, overtime_hours, status, source]
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Daily Attendance"
    ws.views.sheetView[0].showGridLines = True
    
    # Title Block
    ws.cell(row=2, column=2, value="DAILY ATTENDANCE REPORT").font = TITLE_FONT
    ws.cell(row=3, column=2, value=f"Date: {report_date.strftime('%A, %d %B %Y')}").font = SUBTITLE_FONT
    
    # Headers
    headers = [
        "Employee ID", "Employee Name", "Department", "Check-In", 
        "Check-Out", "Working Hours", "Overtime (hrs)", "Status", "Source"
    ]
    
    start_row = 5
    for col_idx, header in enumerate(headers, start=2):
        cell = ws.cell(row=start_row, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = ALIGN_CENTER
        cell.border = THIN_BORDER
        
    # Data Rows
    current_row = start_row + 1
    for r in records:
        ws.cell(row=current_row, column=2, value=r.get("employee_id")).alignment = ALIGN_CENTER
        ws.cell(row=current_row, column=3, value=r.get("employee_name")).alignment = ALIGN_LEFT
        ws.cell(row=current_row, column=4, value=r.get("department") or "N/A").alignment = ALIGN_LEFT
        
        # Check-in/out formatted as string
        cin = r.get("check_in")
        cout = r.get("check_out")
        cin_str = cin.strftime("%I:%M %p") if cin else "--:--"
        cout_str = cout.strftime("%I:%M %p") if cout else "--:--"
        
        ws.cell(row=current_row, column=5, value=cin_str).alignment = ALIGN_CENTER
        ws.cell(row=current_row, column=6, value=cout_str).alignment = ALIGN_CENTER
        ws.cell(row=current_row, column=7, value=float(r.get("working_hours") or 0.00)).alignment = ALIGN_RIGHT
        ws.cell(row=current_row, column=8, value=float(r.get("overtime_hours") or 0.00)).alignment = ALIGN_RIGHT
        
        status_cell = ws.cell(row=current_row, column=9, value=str(r.get("status")).upper())
        status_cell.alignment = ALIGN_CENTER
        # Color coding status
        status = str(r.get("status")).lower()
        if status in ("present", "wfh"):
            status_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid") # light green
            status_font = Font(name=FONT_NAME, size=10, bold=True, color="065F46")
        elif status == "late":
            status_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid") # light amber
            status_font = Font(name=FONT_NAME, size=10, bold=True, color="92400E")
        elif status in ("absent", "half_day"):
            status_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid") # light red
            status_font = Font(name=FONT_NAME, size=10, bold=True, color="991B1B")
        else: # leave
            status_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid") # light blue
            status_font = Font(name=FONT_NAME, size=10, bold=True, color="1E40AF")
            
        status_cell.fill = status_fill
        status_cell.font = status_font
        
        ws.cell(row=current_row, column=10, value=str(r.get("source")).capitalize()).alignment = ALIGN_CENTER
        
        # Apply fonts and borders
        for col_idx in range(2, 11):
            c = ws.cell(row=current_row, column=col_idx)
            if col_idx != 9:  # Keep custom font for status
                c.font = REGULAR_FONT
            c.border = THIN_BORDER
            
        current_row += 1
        
    _autofit_columns(ws)
    
    buffer = BytesIO()
    wb.save(buffer)
    excel_bytes = buffer.getvalue()
    buffer.close()
    return excel_bytes


def generate_monthly_attendance_excel(year: int, month: int, summaries: list) -> bytes:
    """
    Generates a monthly attendance summary report Excel.
    summaries is a list of dicts:
    [employee_id, employee_name, department, designation, present_days, absent_days, leave_days, overtime_hours]
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Monthly Attendance"
    ws.views.sheetView[0].showGridLines = True
    
    # Title Block
    ws.cell(row=2, column=2, value="MONTHLY ATTENDANCE SUMMARY").font = TITLE_FONT
    month_name = calendar.month_name[month]
    ws.cell(row=3, column=2, value=f"Period: {month_name} {year}").font = SUBTITLE_FONT
    
    # Headers
    headers = [
        "Employee ID", "Employee Name", "Department", "Designation", 
        "Present Days", "Absent Days", "Leave Days", "Overtime Hours"
    ]
    
    start_row = 5
    for col_idx, header in enumerate(headers, start=2):
        cell = ws.cell(row=start_row, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = ALIGN_CENTER
        cell.border = THIN_BORDER
        
    # Data Rows
    current_row = start_row + 1
    for s in summaries:
        ws.cell(row=current_row, column=2, value=s.get("employee_id")).alignment = ALIGN_CENTER
        ws.cell(row=current_row, column=3, value=s.get("employee_name")).alignment = ALIGN_LEFT
        ws.cell(row=current_row, column=4, value=s.get("department") or "N/A").alignment = ALIGN_LEFT
        ws.cell(row=current_row, column=5, value=s.get("designation") or "N/A").alignment = ALIGN_LEFT
        ws.cell(row=current_row, column=6, value=float(s.get("present_days") or 0.0)).alignment = ALIGN_RIGHT
        ws.cell(row=current_row, column=7, value=float(s.get("absent_days") or 0.0)).alignment = ALIGN_RIGHT
        ws.cell(row=current_row, column=8, value=float(s.get("leave_days") or 0.0)).alignment = ALIGN_RIGHT
        ws.cell(row=current_row, column=9, value=float(s.get("overtime_hours") or 0.00)).alignment = ALIGN_RIGHT
        
        # Style all cells
        for col_idx in range(2, 10):
            c = ws.cell(row=current_row, column=col_idx)
            c.font = REGULAR_FONT
            c.border = THIN_BORDER
            
        current_row += 1
        
    _autofit_columns(ws)
    
    buffer = BytesIO()
    wb.save(buffer)
    excel_bytes = buffer.getvalue()
    buffer.close()
    return excel_bytes


def generate_payroll_report_excel(year: int, month: int, payrolls: list) -> bytes:
    """
    Generates a monthly payroll report Excel.
    payrolls is a list of dicts/objects with:
    [employee_id, employee_name, department, working_days, present_days, overtime_hours, basic_salary, overtime_pay, deductions, final_salary, is_paid]
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Payroll Report"
    ws.views.sheetView[0].showGridLines = True
    
    # Title Block
    ws.cell(row=2, column=2, value="MONTHLY PAYROLL SUMMARY REPORT").font = TITLE_FONT
    month_name = calendar.month_name[month]
    ws.cell(row=3, column=2, value=f"Period: {month_name} {year}").font = SUBTITLE_FONT
    
    # Headers
    headers = [
        "Employee ID", "Employee Name", "Department", "Working Days", 
        "Present Days", "Overtime (hrs)", "Basic Salary (INR)", "Overtime Pay (INR)", 
        "Deductions (INR)", "Net Salary (INR)", "Payment Status"
    ]
    
    start_row = 5
    for col_idx, header in enumerate(headers, start=2):
        cell = ws.cell(row=start_row, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = ALIGN_CENTER
        cell.border = THIN_BORDER
        
    # Data Rows
    current_row = start_row + 1
    
    # Accumulators for totals
    total_basic = 0.0
    total_ot_pay = 0.0
    total_deductions = 0.0
    total_net = 0.0
    
    for p in payrolls:
        basic = float(p.get("basic_salary") or 0.0)
        ot_pay = float(p.get("overtime_pay") or 0.0)
        ded = float(p.get("deductions") or 0.0)
        net = float(p.get("final_salary") or 0.0)
        
        total_basic += basic
        total_ot_pay += ot_pay
        total_deductions += ded
        total_net += net
        
        ws.cell(row=current_row, column=2, value=p.get("employee_id")).alignment = ALIGN_CENTER
        ws.cell(row=current_row, column=3, value=p.get("employee_name")).alignment = ALIGN_LEFT
        ws.cell(row=current_row, column=4, value=p.get("department") or "N/A").alignment = ALIGN_LEFT
        ws.cell(row=current_row, column=5, value=int(p.get("working_days") or 0)).alignment = ALIGN_RIGHT
        ws.cell(row=current_row, column=6, value=float(p.get("present_days") or 0.0)).alignment = ALIGN_RIGHT
        ws.cell(row=current_row, column=7, value=float(p.get("overtime_hours") or 0.0)).alignment = ALIGN_RIGHT
        ws.cell(row=current_row, column=8, value=basic).alignment = ALIGN_RIGHT
        ws.cell(row=current_row, column=9, value=ot_pay).alignment = ALIGN_RIGHT
        ws.cell(row=current_row, column=10, value=ded).alignment = ALIGN_RIGHT
        ws.cell(row=current_row, column=11, value=net).alignment = ALIGN_RIGHT
        
        status_cell = ws.cell(row=current_row, column=12, value="PAID" if p.get("is_paid") else "UNPAID")
        status_cell.alignment = ALIGN_CENTER
        if p.get("is_paid"):
            status_cell.fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
            status_cell.font = Font(name=FONT_NAME, size=10, bold=True, color="065F46")
        else:
            status_cell.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
            status_cell.font = Font(name=FONT_NAME, size=10, bold=True, color="991B1B")
            
        for col_idx in range(2, 12):
            c = ws.cell(row=current_row, column=col_idx)
            c.font = REGULAR_FONT
            c.border = THIN_BORDER
            # Currency format for financials
            if col_idx in (8, 9, 10, 11):
                c.number_format = '"₹"#,##0.00'
                
        ws.cell(row=current_row, column=12).border = THIN_BORDER
        current_row += 1
        
    # Totals Row
    ws.cell(row=current_row, column=3, value="Total").font = BOLD_FONT
    ws.cell(row=current_row, column=8, value=total_basic).font = BOLD_FONT
    ws.cell(row=current_row, column=9, value=total_ot_pay).font = BOLD_FONT
    ws.cell(row=current_row, column=10, value=total_deductions).font = BOLD_FONT
    ws.cell(row=current_row, column=11, value=total_net).font = BOLD_FONT
    
    # Alignments & formats for totals
    ws.cell(row=current_row, column=8).number_format = '"₹"#,##0.00'
    ws.cell(row=current_row, column=9).number_format = '"₹"#,##0.00'
    ws.cell(row=current_row, column=10).number_format = '"₹"#,##0.00'
    ws.cell(row=current_row, column=11).number_format = '"₹"#,##0.00'
    
    ws.cell(row=current_row, column=8).alignment = ALIGN_RIGHT
    ws.cell(row=current_row, column=9).alignment = ALIGN_RIGHT
    ws.cell(row=current_row, column=10).alignment = ALIGN_RIGHT
    ws.cell(row=current_row, column=11).alignment = ALIGN_RIGHT
    
    for col_idx in range(2, 13):
        c = ws.cell(row=current_row, column=col_idx)
        c.border = TOTAL_BORDER
        
    _autofit_columns(ws)
    
    buffer = BytesIO()
    wb.save(buffer)
    excel_bytes = buffer.getvalue()
    buffer.close()
    return excel_bytes
