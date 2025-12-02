const API_BASE_URL = 'http://10.51.33.36:3000/api';

        let pollsData = [];
        let studentsData = [];
        let currentPoll = null;
        let currentStudent = null;

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            loadPolls();
            loadStudents();
        });

async function loadPolls() {
    try {
        const response = await fetch(`${API_BASE_URL}/analysis/polls`);
        if (!response.ok) throw new Error('Failed to fetch polls');

        const result = await response.json();
        pollsData = result; // <-- use result directly

        if (pollsData.length > 0) {
            currentPoll = pollsData[0];
            renderPolls();
            displayPollDetails(currentPoll);
        } else {
            document.getElementById('pollList').innerHTML =
                '<p style="text-align:center;color:#999;">No polls available</p>';
        }

    } catch (error) {
        console.error('Error loading polls:', error);
        document.getElementById('pollList').innerHTML =
            '<div class="error">Failed to load polls. Please try again.</div>';
    }
}

async function loadStudents() {
    try {
        const response = await fetch(`${API_BASE_URL}/analysis/students`);
        if (!response.ok) throw new Error('Failed to fetch students');

        const result = await response.json();
        studentsData = result; // <-- use result directly

        if (studentsData.length > 0) {
            currentStudent = studentsData[0];
            renderStudents();
            displayStudentDetails(currentStudent);
        } else {
            document.getElementById('studentList').innerHTML =
                '<p style="text-align:center;color:#999;">No students available</p>';
        }

    } catch (error) {
        console.error('Error loading students:', error);
        document.getElementById('studentList').innerHTML =
            '<div class="error">Failed to load students. Please try again.</div>';
    }
}


        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
            
            if (tab === 'polls') {
                document.querySelectorAll('.tab')[0].classList.add('active');
                document.getElementById('polls-content').classList.add('active');
            } else {
                document.querySelectorAll('.tab')[1].classList.add('active');
                document.getElementById('students-content').classList.add('active');
            }
        }

        function renderPolls(filteredData = pollsData) {
            const pollList = document.getElementById('pollList');
            
            if (filteredData.length === 0) {
                pollList.innerHTML = '<p style="text-align:center;color:#999;">No polls found</p>';
                return;
            }
            
            pollList.innerHTML = '';
            
            filteredData.forEach(poll => {
                const card = document.createElement('div');
                card.className = 'poll-card' + (currentPoll && poll.id === currentPoll.id ? ' selected' : '');
                card.onclick = () => selectPoll(poll);
                
                card.innerHTML = `
                    <span class="poll-status status-${poll.status}">● ${poll.status}</span>
                    <span class="poll-end">Ends: ${poll.endDate}</span>
                    <div class="poll-title">${poll.title}</div>
                    <div class="poll-stats">${poll.totalVotes} votes</div>
                    <div class="poll-stats">Participation: ${poll.participation}%</div>
                `;
                
                pollList.appendChild(card);
            });
        }

        function selectPoll(poll) {
            currentPoll = poll;
            renderPolls();
            displayPollDetails(poll);
        }

        function displayPollDetails(poll) {
            const details = document.getElementById('pollDetails');
            
            let optionBars = '';
            poll.options.forEach(option => {
                optionBars += `
                    <div class="option-bar">
                        <div class="option-header">
                            <span class="option-name">${option.name}</span>
                            <span class="option-votes">${option.votes} votes (${option.percentage}%)</span>
                        </div>
                        <div class="bar-container">
                            <div class="bar-fill" style="width: ${option.percentage}%; background: ${option.color};"></div>
                        </div>
                    </div>
                `;
            });

            const pieChart = createPieChart(poll.options);
            
            details.innerHTML = `
                <div class="section-title">Result Overview</div>
                <div class="result-title">${poll.title}</div>
                ${optionBars}
                <div class="chart-container">
                    <div class="pie-chart">${pieChart}</div>
                </div>
                <div class="section-title" style="margin-top: 20px;">Poll Performance Chart</div>
                <div class="chart-legend">
                    ${poll.options.map(opt => `
                        <div class="legend-item">
                            <div class="legend-color" style="background: ${opt.color};"></div>
                            <span>${opt.name}: ${opt.percentage}%</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        function createPieChart(options) {
            let startAngle = -90;
            let paths = '';
            
            options.forEach(option => {
                const angle = (option.percentage / 100) * 360;
                const endAngle = startAngle + angle;
                
                const x1 = 150 + 140 * Math.cos(startAngle * Math.PI / 180);
                const y1 = 150 + 140 * Math.sin(startAngle * Math.PI / 180);
                const x2 = 150 + 140 * Math.cos(endAngle * Math.PI / 180);
                const y2 = 150 + 140 * Math.sin(endAngle * Math.PI / 180);
                
                const largeArc = angle > 180 ? 1 : 0;
                
                paths += `
                    <path d="M 150 150 L ${x1} ${y1} A 140 140 0 ${largeArc} 1 ${x2} ${y2} Z" 
                          fill="${option.color}" 
                          stroke="white" 
                          stroke-width="2"/>
                `;
                
                if (option.percentage > 0) {
                    const labelAngle = startAngle + angle / 2;
                    const labelX = 150 + 100 * Math.cos(labelAngle * Math.PI / 180);
                    const labelY = 150 + 100 * Math.sin(labelAngle * Math.PI / 180);
                    
                    paths += `
                        <text x="${labelX}" y="${labelY}" 
                              text-anchor="middle" 
                              dominant-baseline="middle" 
                              fill="white" 
                              font-weight="bold" 
                              font-size="14">
                            ${option.percentage}%
                        </text>
                    `;
                }
                
                startAngle = endAngle;
            });
            
            return `<svg viewBox="0 0 300 300">${paths}</svg>`;
        }

        function filterPolls() {
            const search = document.getElementById('searchInput').value.toLowerCase();
            const filtered = pollsData.filter(poll => 
                poll.title.toLowerCase().includes(search)
            );
            renderPolls(filtered);
        }

        function renderStudents(filteredData = studentsData) {
    const studentList = document.getElementById('studentList');

    if (filteredData.length === 0) {
        studentList.innerHTML = '<p style="text-align:center;color:#999;">No students found</p>';
        return;
    }

    studentList.innerHTML = '';

    filteredData.forEach(student => {
        const engagementScore = calculateEngagement(student.totalPoints);

        const card = document.createElement('div');
        card.className = 'student-card' + (currentStudent && student.id === currentStudent.id ? ' selected' : '');
        card.onclick = () => selectStudent(student);

        card.innerHTML = `
            <div class="student-name">${student.name}</div>
            <div class="student-id">${student.studentId}</div>
            <div class="engagement-score">Engagement: ${engagementScore}</div>
            <div class="total-points">Points: ${student.totalPoints}</div>
        `;

        studentList.appendChild(card);
    });
}

function displayStudentDetails(student) {
    const details = document.getElementById('studentDetails');
    const engagementScore = calculateEngagement(student.totalPoints);

    details.innerHTML = `
        <div class="section-title">Student Overview</div>
        <div class="result-title">${student.name}</div>
        <div class="student-id">ID: ${student.studentId}</div>
        <div class="total-points">Total Points: ${student.totalPoints}</div>
        <div class="engagement-score" style="font-weight:bold; margin-top:10px;">
            Engagement Score: ${engagementScore}
        </div>
    `;
}

// Example: convert points into a simple engagement score
function calculateEngagement(points) {
    if (points >= 30000) return 'Excellent';
    if (points >= 10000) return 'High';
    if (points > 0) return 'Moderate';
    return 'Low';
}

        function selectStudent(student) {
            currentStudent = student;
            renderStudents();
            displayStudentDetails(student);
        }


        function createLineChart(data) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
            const width = 900;
            const height = 300;
            const padding = 50;
            const chartWidth = width - padding * 2;
            const chartHeight = height - padding * 2;
            
            const maxValue = 100;
            const minValue = 70;
            
            let points = '';
            let circles = '';
            
            data.forEach((value, i) => {
                const x = padding + (i / (data.length - 1)) * chartWidth;
                const y = padding + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;
                
                points += `${x},${y} `;
                circles += `<circle cx="${x}" cy="${y}" r="5" fill="#8b3a62" stroke="white" stroke-width="2"/>`;
            });
            
            let gridLines = '';
            for (let i = 0; i <= 4; i++) {
                const y = padding + (i / 4) * chartHeight;
                const value = Math.round(maxValue - (i / 4) * (maxValue - minValue));
                gridLines += `
                    <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" 
                          stroke="#e5e5e5" stroke-dasharray="3,3"/>
                    <text x="${padding - 10}" y="${y}" text-anchor="end" 
                          dominant-baseline="middle" font-size="12" fill="#666">
                        ${value}
                    </text>
                `;
            }
            
            let xLabels = '';
            months.forEach((month, i) => {
                const x = padding + (i / (months.length - 1)) * chartWidth;
                xLabels += `
                    <text x="${x}" y="${height - padding + 20}" 
                          text-anchor="middle" font-size="12" fill="#666">
                        ${month}
                    </text>
                `;
            });
            
            return `
                <svg viewBox="0 0 ${width} ${height}">
                    ${gridLines}
                    ${xLabels}
                    <polyline points="${points}" fill="none" stroke="#8b3a62" stroke-width="3"/>
                    ${circles}
                </svg>
            `;
        }

        function filterStudents() {
            const month = document.getElementById('monthFilter').value;
            const year = document.getElementById('yearFilter').value;
            
            const filtered = studentsData.filter(student => {
                return (!month || student.month === month) && (!year || student.year === year);
            });
            
            renderStudents(filtered);
        }
    