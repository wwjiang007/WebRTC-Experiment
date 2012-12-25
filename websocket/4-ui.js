﻿/* client video + capture client camera */
var clientVideo = $('#client-video');
function captureCamera() {
    getUserMedia({
        video: clientVideo,
        onsuccess: function (stream) {
            global.clientStream = stream;
            clientVideo.play();
        },
        onerror: function () {
            location.reload();
        }
    });
}

/* possible situations
1) you joined a room
2) someone joined your room (i.e. you found a participant!)
*/
function hideListsAndBoxes() {
    disable(true);
    global.isGetAvailableRoom = false;
}

/* waiting until socket is open -- then we will enable input boxes */
hideListsAndBoxes();

/* primarily called when someone left your room */
function showListsAndBoxes() {
    disable(false);
    $('table', true).show();

    global.isGetAvailableRoom = true;
}

/* the user have not yet allowed his camera access */
global.mediaAccessAlertMessage = 'This app wants to use your camera and microphone.\n\nGrant it the access!';

/* generating a unique token for current user */
global.userToken = uniqueToken();

/* setting defaults for both video elements */
$('#remote-video').css('width', innerWidth + 'px').css('height', innerHeight + 'px');
$('#client-video').css('width', innerWidth + 'px').css('height', innerHeight + 'px');

/* you wanted to create a private room! */
$('#is-private').onchange = function () {
    if (this.checked) $('#partner-email').css('padding', '10px 20px').css('height', 'auto').css('border-bottom', '1px double #CACACA').slideDown().querySelector('#partner-email').focus();
    else $('#partner-email').css('padding', 0).css('border-bottom', 0).slideUp();
};

/* you tried to create a new room! */
$('#create-room').onclick = function () {
    var fullName = $('#full-name'),
        roomName = $('#room-name'),
        partnerEmail = $('input#partner-email');

    if (fullName.value.length <= 0) {
        alert('Please enter your full name.');
        fullName.focus();
        return;
    }

    if (roomName.value.length <= 0) {
        alert('Please enter room name.');
        roomName.focus();
        return;
    }

    var isChecked = $('#is-private').checked;

    /* if you checked the box but not entered anything like email or token! */
    if (isChecked && partnerEmail.value.length <= 0) {
        alert('Please enter your partner\'s email or token.');
        partnerEmail.focus();
        return;
    }

    /* client stream is MUST! */
    if (!global.clientStream) {
        alert(global.mediaAccessAlertMessage);
        return;
    }

    /* setting users defaults */
    global.userName = fullName.value;
    global.roomName = roomName.value;
    
    /* no need to get anymore rooms */
    global.isGetAvailableRoom = false;
    
    /* don't allow user to play with input boxes because he created a room! */
    hideListsAndBoxes();
    
    /* generating a unique token for room! */
    global.roomToken = uniqueToken();

    /* if client want to create a private room! */
    if (isChecked && partnerEmail.value.length) {
        pubnub.unsubscribe();
        pubnub.channel = partnerEmail.value;
        global.isPrivateRoom = true;

        initSocket();
    }

    /* client is the one who created offer or...! */
    global.offerer = true;

    /* propagate room around the globe!! */
    spreadRoom();
    window.scrollTo(0, 0);
};

function spreadRoom() {
    var g = global;

    socket.send({
        roomToken: g.roomToken,
        ownerName: g.userName,
        ownerToken: g.userToken,
        roomName: g.roomName
    });

    /* propagate room around the globe until a participant found! */
    !global.participant && setTimeout(spreadRoom, 500);
}

/* you tried to search a private room! */
$('#search-room').onclick = function () {
    var email = $('input#email');
    if (!email.value.length) {
        alert('Please enter the email or unique token/word that your partner given you.');
        email.focus();
        return;
    }

    global.searchPrivateRoom = email.value;

    log('Creating channel: ' + email.value);

    pubnub.unsubscribe();
    pubnub.channel = email.value;
    initSocket(function () {
        log('Searching a private room for: ' + global.searchPrivateRoom);
        email.value = '';
    });
    window.scrollTo(0, 0);
};

/* if other end close the room; refreshing the UI for current user */
function refreshUI() {
    log('RTC room is closed by other user.');
    remoteVideo.css('top', '-100%').pause();
    remoteVideo.setAttribute('src', '');
    clientVideo.css('width', innerWidth + 'px').css('height', innerHeight + 'px').css('z-index', -1);

    $('table', true).show();
    disable(false);

    global.rtc = null;

    global.isGetAvailableRoom = true;
    global.isGotRemoteStream = false;

    pubnub.unsubscribe();
    pubnub.channel = global.defaultChannel;
}

/* searching public (or private) rooms */
global.isGetAvailableRoom = true;
var publicRooms = $('#public-rooms');

function getAvailableRooms(response) {
    if (!global.isGetAvailableRoom || !response.ownerToken) return;

    /* room is already visible in the current user's page */
    var alreadyExist = $('#' + response.ownerToken);
    if (alreadyExist) return;

    /* showing the room for current user */
    var blockquote = document.createElement('blockquote');
    blockquote.setAttribute('id', response.ownerToken);

    blockquote.innerHTML = response.roomName
            + '<a href="#" class="join" id="' + response.roomToken + '">Join Room</a><br/>'
                + '<br /><small>Created by <span class="roshan">' + response.ownerName + '</span></small>';

    publicRooms.insertBefore(blockquote, publicRooms.childNodes[0]);

    /* allowing user to join rooms! */
    $('.join', true).each(function (span) {
        span.onclick = function () {
            if (!global.clientStream) {
                alert(global.mediaAccessAlertMessage);
                return;
            }

            global.userName = prompt('Enter your name');

            if (!global.userName.length) {
                alert('You\'ve not entered your name. Too bad!');
                return;
            }

            global.isGetAvailableRoom = false;
            hideListsAndBoxes();

            global.roomToken = this.id;

            var forUser = this.parentNode.id;

            /* telling room owner that I'm your participant! */
            socket.send({
                participant: global.userName,
                userToken: global.userToken,
                forUser: forUser,
                
                /* let other end know that whether you support opus */
                isopus: isopus
            });


            /* for public rooms; hide the room from all around the globe! because room is busy! */
            if (!global.searchPrivateRoom) {
                socket.send({
                    userToken: global.userToken,
                    isBusyRoom: true,
                    ownerToken: forUser
                });

                pubnub.unsubscribe();

                pubnub.channel = global.roomToken;
                initSocket();
            }

            window.scrollTo(0, 0);
            this.parentNode.parentNode.removeChild(this.parentNode);
        };
    });
}